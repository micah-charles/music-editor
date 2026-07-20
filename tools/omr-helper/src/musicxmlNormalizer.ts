import AdmZip from "adm-zip";
import fs from "node:fs/promises";
import path from "node:path";

export async function readMusicXmlAsText(filePath: string): Promise<{ xml: string; warnings: string[] }> {
  const warnings: string[] = [];
  const ext = path.extname(filePath).toLowerCase();
  const data = await fs.readFile(filePath);
  const xml = ext === ".mxl" ? readMxl(data, warnings) : data.toString("utf8");
  if (!xml.includes("<score-partwise") && !xml.includes("<score-timewise")) {
    warnings.push("Output does not obviously contain score-partwise/score-timewise MusicXML.");
  }
  return { xml: addFoxChildIdentification(xml), warnings };
}

function readMxl(data: Buffer, warnings: string[]): string {
  const zip = new AdmZip(data);
  const entry = zip.getEntries().find((item) => {
    const name = item.entryName.toLowerCase();
    return !item.isDirectory && name.endsWith(".xml") && name !== "meta-inf/container.xml";
  });
  if (!entry) {
    throw new Error("MXL output did not contain a score XML file.");
  }
  warnings.push("Audiveris produced compressed MXL; helper unpacked the score XML for FoxChild import.");
  return entry.getData().toString("utf8");
}

function addFoxChildIdentification(xml: string): string {
  if (!xml.includes("<score-partwise") && !xml.includes("<score-timewise")) {
    return xml;
  }
  const misc = [
    "    <miscellaneous>",
    "      <miscellaneous-field name=\"foxchild-import-type\">audiveris-omr-draft</miscellaneous-field>",
    "      <miscellaneous-field name=\"source-confidence\">omr-draft</miscellaneous-field>",
    "      <miscellaneous-field name=\"requires-human-review\">true</miscellaneous-field>",
    "    </miscellaneous>"
  ].join("\n");
  if (xml.includes("foxchild-import-type")) {
    return xml;
  }
  if (xml.includes("</identification>")) {
    return xml.replace("</identification>", `${misc}\n  </identification>`);
  }
  const partListIndex = xml.indexOf("<part-list>");
  if (partListIndex > -1) {
    const identification = `  <identification>\n${misc}\n  </identification>\n`;
    return xml.slice(0, partListIndex) + identification + xml.slice(partListIndex);
  }
  return xml;
}
