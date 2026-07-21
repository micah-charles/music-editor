export type RealScoreFixture = {
  id: string;
  category: string;
  xml: string;
};

const header = (title: string, partList: string, parts: string) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <part-list>${partList}</part-list>
  ${parts}
</score-partwise>`;

const scorePart = (id: string, name: string, channel: number, program: number) => `<score-part id="${id}">
  <part-name>${name}</part-name>
  <midi-instrument id="${id}-I1"><midi-channel>${channel}</midi-channel><midi-program>${program}</midi-program></midi-instrument>
</score-part>`;

const pitchedNote = (step: string, octave: number, duration: number, type: string, extra = "") => `<note>
  <pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration>${extra}<type>${type}</type>
</note>`;

export const simpleMelodyFixture: RealScoreFixture = {
  id: "simple-melody",
  category: "Simple single-line melody",
  xml: header("Synthetic Melody", scorePart("P1", "Flute", 1, 74), `<part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><sound tempo="96"/></direction>
      ${["C", "D", "E", "G"].map((step) => pitchedNote(step, 4, 4, "quarter", "<voice>1</voice><staff>1</staff>")).join("\n")}
    </measure>
  </part>`)
};

export const grandStaffFixture: RealScoreFixture = {
  id: "piano-grand-staff-two-voices",
  category: "Piano grand staff with two voices",
  xml: header("Synthetic Grand Staff", scorePart("P1", "Piano", 1, 1), `<part id="P1">
    <measure number="1">
      <attributes><divisions>12</divisions><key><fifths>1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
      ${["G", "A", "B", "C"].map((step, index) => pitchedNote(step, index === 3 ? 5 : 4, 12, "quarter", "<voice>1</voice><staff>1</staff>")).join("\n")}
      <backup><duration>48</duration></backup>
      ${pitchedNote("G", 2, 48, "whole", "<voice>2</voice><staff>2</staff>")}
    </measure>
    <measure number="2">
      ${pitchedNote("D", 5, 24, "half", "<voice>1</voice><staff>1</staff>")}
      ${pitchedNote("B", 4, 24, "half", "<voice>1</voice><staff>1</staff>")}
      <backup><duration>48</duration></backup>
      ${pitchedNote("D", 3, 24, "half", "<voice>2</voice><staff>2</staff>")}
      ${pitchedNote("G", 2, 24, "half", "<voice>2</voice><staff>2</staff>")}
    </measure>
  </part>`)
};

export const ensembleFixture: RealScoreFixture = {
  id: "multi-instrument-ensemble",
  category: "Multi-instrument ensemble",
  xml: header("Synthetic Trio", [
    scorePart("P1", "Flute", 1, 74),
    scorePart("P2", "Violin", 2, 41),
    scorePart("P3", "Cello", 3, 43)
  ].join(""), [
    ["P1", "C", 5], ["P2", "E", 4], ["P3", "C", 3]
  ].map(([id, step, octave]) => `<part id="${id}"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${pitchedNote(String(step), Number(octave), 16, "whole", "<voice>1</voice><staff>1</staff>")}</measure></part>`).join(""))
};

export const tiesTupletsFixture: RealScoreFixture = {
  id: "ties-tuplets-across-measures",
  category: "Ties and tuplets across measures",
  xml: header("Synthetic Ties and Tuplets", scorePart("P1", "Clarinet", 1, 72), `<part id="P1">
    <measure number="1">
      <attributes><divisions>12</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      ${pitchedNote("C", 4, 24, "half", '<tie type="start"/><voice>1</voice><staff>1</staff><notations><tied type="start"/></notations>')}
      ${["D", "E", "F", "G", "A", "B"].map((step) => pitchedNote(step, 4, 4, "eighth", '<voice>1</voice><staff>1</staff><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes><normal-type>eighth</normal-type></time-modification>')).join("\n")}
    </measure>
    <measure number="2">
      ${pitchedNote("C", 4, 24, "half", '<tie type="stop"/><voice>1</voice><staff>1</staff><notations><tied type="stop"/></notations>')}
      <note><rest/><duration>24</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>`)
};

export const pickupTempoFixture: RealScoreFixture = {
  id: "pickup-tempo-changes",
  category: "Pickup measure and tempo changes",
  xml: header("Synthetic Pickup and Tempo", scorePart("P1", "Oboe", 1, 69), `<part id="P1">
    <measure number="1" implicit="yes">
      <attributes><divisions>4</divisions><key><fifths>-1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><sound tempo="120"/></direction>${pitchedNote("F", 4, 4, "quarter", "<voice>1</voice><staff>1</staff>")}
    </measure>
    <measure number="2">
      ${pitchedNote("B", 4, 8, "half", "<voice>1</voice><staff>1</staff>")}
      <direction><offset>8</offset><sound tempo="60"/></direction>
      ${pitchedNote("C", 5, 8, "half", "<voice>1</voice><staff>1</staff>")}
    </measure>
  </part>`)
};

export const repeatsEndingsFixture: RealScoreFixture = {
  id: "repeats-first-second-endings",
  category: "Repeats with first and second endings",
  xml: header("Synthetic Endings", scorePart("P1", "Trumpet", 1, 57), `<part id="P1">
    <measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><barline location="left"><repeat direction="forward"/></barline>${pitchedNote("C", 4, 16, "whole", "<voice>1</voice><staff>1</staff>")}</measure>
    <measure number="2">${pitchedNote("D", 4, 16, "whole", "<voice>1</voice><staff>1</staff>")}<barline location="right"><ending number="1" type="stop"/><repeat direction="backward" times="2"/></barline></measure>
    <measure number="3">${pitchedNote("E", 4, 16, "whole", "<voice>1</voice><staff>1</staff>")}<barline location="right"><ending number="2" type="discontinue"/></barline></measure>
  </part>`)
};

export function largeScoreFixture(measureCount = 320): RealScoreFixture {
  const measures = Array.from({ length: measureCount }, (_, index) => `<measure number="${index + 1}">
    ${index === 0 ? "<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>" : ""}
    ${["C", "D", "E", "G"].map((step) => pitchedNote(step, 4 + (index % 2), 4, "quarter", "<voice>1</voice><staff>1</staff>")).join("\n")}
  </measure>`).join("\n");
  return {
    id: "large-320-measures",
    category: "Large score with hundreds of measures",
    xml: header("Synthetic Large Score", scorePart("P1", "Piano", 1, 1), `<part id="P1">${measures}</part>`)
  };
}

export const syntheticRealScoreFixtures = [
  simpleMelodyFixture,
  grandStaffFixture,
  ensembleFixture,
  tiesTupletsFixture,
  pickupTempoFixture,
  repeatsEndingsFixture,
  largeScoreFixture()
];
