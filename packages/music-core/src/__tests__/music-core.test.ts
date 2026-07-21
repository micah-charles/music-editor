import { describe, expect, it } from "vitest";
import { Midi } from "@tonejs/midi";
import { writeMidi, type MidiData } from "midi-file";
import { readFileSync } from "node:fs";
import {
  astToLearningPack,
  astToMidi,
  astToMusicXml,
  astToPlaybackEvents,
  chordProgressionToAst,
  compileScoreTimeline,
  countNotes,
  DURATION_BEATS,
  detectChordName,
  detectRomanNumeral,
  getDemoChordLibraryIndex,
  importChordMidiToAst,
  importAstJson,
  midiToAst,
  musicXmlToAst,
  pitchToMidi,
  pitchToName,
  plainTextToAst,
  simpleJsonToAst,
  simpleMelodyAst,
  validateScore,
  validateMeasure,
  validateScoreMeasures,
  withMeasureValidation,
  transposeProgressionChordNames,
  midiToPitch,
  parsePitchName,
  type FoxChildSimpleScoreV1
} from "../index";

describe("@foxchild/music-core", () => {
  it("validates the demo AST score", () => {
    const result = validateScore(simpleMelodyAst);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts Audiveris OMR as draft source metadata", () => {
    const score = structuredClone(simpleMelodyAst);
    score.sourceMetadata = {
      originalFormat: "audiveris-omr",
      draftTranscription: true,
      warnings: ["OMR draft: compare against the original scan before final use."]
    };

    const result = validateScore(score);
    expect(result.valid).toBe(true);
    expect(score.sourceMetadata.originalFormat).toBe("audiveris-omr");
  });

  it("converts pitch names and MIDI numbers", () => {
    expect(pitchToMidi(parsePitchName("C4"))).toBe(60);
    expect(pitchToName(midiToPitch(61))).toBe("C#4");
    expect(pitchToMidi(parsePitchName("Bb3"))).toBe(58);
  });

  it("keeps duration beats explicit and simple", () => {
    expect(DURATION_BEATS.quarter).toBe(1);
    expect(DURATION_BEATS["dotted-quarter"]).toBe(1.5);
  });

  it("validates complete, underfilled, and overfilled measures", () => {
    expect(validateMeasure(4, 4)).toBe("complete");
    expect(validateMeasure(3.5, 4)).toBe("underfilled");
    expect(validateMeasure(4.5, 4)).toBe("overfilled");
  });

  it("stores measure validation on the AST with repair suggestions", () => {
    const changed = structuredClone(simpleMelodyAst);
    const firstEvent = changed.parts[0].measures[0].events[0];
    if (firstEvent.type !== "note") {
      throw new Error("Expected demo score to start with a note.");
    }
    firstEvent.duration = { value: "eighth", beats: 0.5 };

    const decorated = withMeasureValidation(changed, simpleMelodyAst);
    const issue = decorated.validation?.measures.find((measure) => measure.measure === 1);

    expect(issue).toMatchObject({
      measure: 1,
      status: "underfilled",
      beatsUsed: 3.5,
      beatsExpected: 4,
      missingBeats: 0.5
    });
    expect(issue?.suggestions).toContain("Add an eighth rest");
    expect(issue?.suggestions).toContain("Change C4 from eighth to quarter");
  });

  it("detects overfilled measures", () => {
    const changed = structuredClone(simpleMelodyAst);
    changed.parts[0].measures[0].events.push({
      id: "too-many-beats",
      type: "note",
      pitch: { step: "G", octave: 4, alter: 0 },
      duration: { value: "quarter", beats: 1 }
    });

    const issue = validateScoreMeasures(changed).find((measure) => measure.measure === 1);
    const validation = validateScore(changed);
    expect(issue?.status).toBe("overfilled");
    expect(issue?.extraBeats).toBe(1);
    expect(validation.valid).toBe(false);
  });

  it("imports plain text notes into AST measures", () => {
    const score = plainTextToAst("C4 quarter\nD4 quarter\nrest quarter\nG4 half");
    expect(score.schemaVersion).toBe("2.0");
    expect(score.parts[0].measures.length).toBeGreaterThan(0);
    expect(countNotes(score.parts[0].measures)).toBe(3);
  });

  it("imports V1 score JSON through the compatibility adapter", () => {
    const v1: FoxChildSimpleScoreV1 = {
      schemaVersion: "1.0",
      id: "v1-example",
      title: "V1 Example",
      tempo: 100,
      key: "C",
      timeSignature: { beats: 4, beatType: 4 },
      tracks: [
        {
          id: "melody",
          name: "Melody",
          instrument: "piano",
          notes: [
            { pitch: "C4", duration: "quarter" },
            { pitch: "D4", duration: "quarter" }
          ]
        }
      ]
    };

    const score = simpleJsonToAst(v1);
    expect(score.schemaVersion).toBe("2.0");
    expect(score.sourceMetadata?.originalFormat).toBe("foxchild-v1");
    expect(importAstJson(JSON.stringify(v1)).schemaVersion).toBe("2.0");
  });

  it("exports and imports the MVP MusicXML subset", () => {
    const xml = astToMusicXml(simpleMelodyAst);
    expect(xml).toContain("<score-partwise");
    expect(xml).toContain("<work-title>Simple Melody in C</work-title>");
    expect(xml).toContain("<step>C</step>");

    const roundTrip = musicXmlToAst(xml);
    expect(roundTrip.metadata.title).toBe("Simple Melody in C");
    expect(countNotes(roundTrip.parts[0].measures)).toBeGreaterThan(0);
  });

  it("imports MusicXML staves and voices as lanes in one playable part", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Two Voice Piano</work-title></work>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
      <midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>2</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction><sound tempo="120"/></direction>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>A</step><octave>2</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

    const imported = musicXmlToAst(xml);
    const validation = validateScore(imported);
    const playbackEvents = astToPlaybackEvents(imported).filter((event) => !event.isRest);

    expect(imported.global.key).toEqual({ tonic: "D", mode: "major", fifths: 2 });
    expect(imported.global.tempo.bpm).toBe(120);
    expect(imported.parts).toHaveLength(1);
    expect(imported.parts[0]).toMatchObject({
      id: "P1",
      clef: "treble",
      staffCount: 2,
      clefs: { 1: "treble", 2: "bass" }
    });
    expect(validation.errors).toEqual([]);
    expect(playbackEvents.map((event) => [event.partId, event.startBeat, event.pitch])).toEqual([
      ["P1", 0, "D5"],
      ["P1", 0, "D3"],
      ["P1", 4, "E5"],
      ["P1", 4, "A2"]
    ]);
  });

  it("preserves the initial key and measure-level key changes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>5</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><rest/><duration>16</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <attributes><key><fifths>5</fifths><mode>major</mode></key></attributes>
      <note><rest/><duration>16</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="3">
      <attributes><key><fifths>-5</fifths><mode>major</mode></key></attributes>
      <note><rest/><duration>16</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

    const imported = musicXmlToAst(xml);
    expect(imported.global.key).toEqual({ tonic: "B", mode: "major", fifths: 5 });
    expect(imported.global.keyEvents).toEqual([
      { position: { measure: 3, beat: 0 }, tonic: "C", mode: "major", fifths: -5 }
    ]);

    const exported = astToMusicXml(imported);
    expect(exported.match(/<fifths>5<\/fifths>/g)).toHaveLength(1);
    expect(exported.match(/<fifths>-5<\/fifths>/g)).toHaveLength(1);

    const roundTrip = musicXmlToAst(exported);
    expect(roundTrip.global.key.fifths).toBe(5);
    expect(roundTrip.global.keyEvents?.map((event) => [event.position.measure, event.fifths])).toEqual([[3, -5]]);
  });

  it("recovers Audiveris title credits and text-only tempo changes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <movement-title>Oshi no Ko Opening</movement-title>
  <identification><encoding><software>Audiveris 5.10.2</software></encoding></identification>
  <credit page="1"><credit-words font-size="16">Idol (アイドル)</credit-words></credit>
  <credit page="1"><credit-words font-size="12">Oshi no Ko Opening</credit-words></credit>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>166</per-minute></metronome></direction-type><sound tempo="166"/></direction>
      <note><rest/><duration>16</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="86">
      <direction><direction-type><words>Allegretto (J = 150)</words></direction-type></direction>
      <note><rest/><duration>16</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

    const imported = musicXmlToAst(xml);
    expect(imported.metadata).toMatchObject({
      title: "Idol (アイドル)",
      movementTitle: "Oshi no Ko Opening",
      subtitle: "Oshi no Ko Opening"
    });
    expect(imported.global.tempo.bpm).toBe(166);
    expect(imported.global.tempo.label).toBeUndefined();
    expect(imported.global.tempoEvents).toContainEqual({
      position: { measure: 86, beat: 0 },
      bpm: 150,
      label: "Allegretto"
    });
    const exported = astToMusicXml(imported);
    expect(exported).toContain("<words>Allegretto</words>");
    expect(exported).toContain("<per-minute>150</per-minute>");
    expect(musicXmlToAst(exported).global.tempoEvents).toContainEqual({
      position: { measure: 86, beat: 0 },
      bpm: 150,
      label: "Allegretto"
    });
  });

  it("imports MusicXML forward gaps as rests for the matching lane", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time symbol="cut"><beats>2</beats><beat-type>2</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <forward><duration>8</duration><voice>1</voice><staff>1</staff></forward>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><chord/><pitch><step>G</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><chord/><pitch><step>C</step><octave>6</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>5</voice><type>half</type><staff>2</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>8</duration><voice>5</voice><type>half</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

    const imported = withMeasureValidation(musicXmlToAst(xml));
    const upperMeasure = imported.parts[0]?.measures[0];
    const upperIssue = imported.validation?.measures.find((measure) => measure.partId === "P1" && measure.measure === 1);

    expect(upperMeasure?.events.flatMap((event) => event.type !== "annotation" && event.type !== "direction" && event.staff === 1 ? [[event.type, event.duration.beats]] : [])).toEqual([
      ["rest", 2],
      ["chord", 2]
    ]);
    expect(upperMeasure?.events.flatMap((event) => event.type !== "annotation" && event.type !== "direction" && event.staff === 2 ? [[event.type, event.duration.beats]] : [])).toEqual([
      ["note", 2],
      ["note", 2]
    ]);
    expect(upperIssue?.status).toBe("complete");
  });

  it("preserves MusicXML triplet time modification through import and export", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Melody</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>24</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><rest/><duration>72</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;

    const imported = withMeasureValidation(musicXmlToAst(xml));
    const notes = imported.parts[0].measures[0].events.slice(0, 3).filter((event) => event.type !== "annotation" && event.type !== "direction");
    const exported = astToMusicXml(imported);

    expect(notes.map((event) => event.duration.beats)).toEqual([0.333333, 0.333333, 0.333333]);
    expect(notes.map((event) => event.duration.tuplet)).toEqual([
      { actualNotes: 3, normalNotes: 2 },
      { actualNotes: 3, normalNotes: 2 },
      { actualNotes: 3, normalNotes: 2 }
    ]);
    expect(imported.validation?.measures[0].status).toBe("complete");
    expect(exported).toContain("<time-modification>");
    expect(exported).toContain("<actual-notes>3</actual-notes>");
    expect(exported).toContain("<normal-notes>2</normal-notes>");
  });

  it("preserves OMR fidelity semantics through MusicXML import and export", () => {
    const xml = readFileSync("packages/music-core/src/__tests__/fixtures/omr-fidelity.musicxml", "utf8");
    const imported = musicXmlToAst(xml);
    const firstMeasure = imported.parts[0].measures[0];
    const exported = astToMusicXml(imported);
    const roundTrip = musicXmlToAst(exported);
    const chord = firstMeasure.events.find((event) => event.type === "chord");
    const dynamic = firstMeasure.events.find((event) => event.type === "direction");
    const bassRest = firstMeasure.events.find((event) => event.type === "rest" && event.voice === 5);
    const voices = new Set(firstMeasure.events.map((event) => event.voice));

    expect(imported.metadata).toMatchObject({
      title: "Fidelity Study",
      movementTitle: "Opening",
      subtitle: "OMR Regression",
      composer: "Test Composer",
      arranger: "Test Arranger"
    });
    expect(imported.global.key).toEqual({ tonic: "E", mode: "major", fifths: 4 });
    expect(imported.global.tempo).toMatchObject({ bpm: 163, source: "musicxml" });
    expect(compileScoreTimeline(imported).tempoMap[0].bpm).toBe(163);
    expect(dynamic).toMatchObject({ type: "direction", dynamic: "f", staff: 1, voice: 1, placement: "below" });
    expect(chord?.type === "chord" ? chord.notation : undefined).toMatchObject({
      articulations: ["staccato"],
      slurs: [{ type: "start", number: 1 }],
      beams: [{ number: 1, value: "begin" }]
    });
    expect(bassRest?.type === "rest" ? bassRest.duration : undefined).toMatchObject({ value: "dotted-half", beats: 3 });
    expect(voices.has(2)).toBe(false);
    expect(voices.has(6)).toBe(false);

    expect(exported).toContain("<fifths>4</fifths>");
    expect(exported).toContain("<per-minute>163</per-minute>");
    expect(exported).toContain('<creator type="arranger">Test Arranger</creator>');
    expect(exported).toContain("<dynamics><f/></dynamics>");
    expect(exported).toContain('<slur type="start" number="1"/>');
    expect(exported).toContain('<slur type="stop" number="1"/>');
    expect(exported.match(/<staccato\/>/g)).toHaveLength(1);
    expect(exported).toContain('<beam number="1">begin</beam>');
    expect(exported).toContain("<type>half</type>\n        <dot/>");
    expect(roundTrip.global.key.fifths).toBe(4);
    expect(roundTrip.global.tempo.bpm).toBe(163);
  });

  it("warns when repeated explicit sharps may hide a lost key signature", () => {
    const source = readFileSync("packages/music-core/src/__tests__/fixtures/omr-fidelity.musicxml", "utf8")
      .replace("<fifths>4</fifths>", "<fifths>0</fifths>")
      .replaceAll("<step>E</step>", "<step>E</step><alter>1</alter>");
    const imported = musicXmlToAst(source);
    expect(imported.sourceMetadata?.warnings).toContain(
      "Possible lost key signature: repeated explicit accidentals detected while key signature is C major."
    );
  });

  it("does not export a contradictory MusicXML type for a non-standard numeric duration", () => {
    const score = structuredClone(simpleMelodyAst);
    const first = score.parts[0].measures[0].events[0];
    if (first.type !== "note") throw new Error("Expected a note.");
    first.duration = { value: "quarter", beats: 1.25 };
    const firstNote = astToMusicXml(score).match(/<note>[\s\S]*?<\/note>/)?.[0] ?? "";
    expect(firstNote).toContain("<duration>30</duration>");
    expect(firstNote).not.toContain("<type>quarter</type>");
  });

  it("exports MIDI and imports it as a draft transcription", () => {
    const bytes = astToMidi(simpleMelodyAst);
    expect(bytes.length).toBeGreaterThan(20);

    const imported = midiToAst(bytes, { title: "Round Trip" });
    expect(imported.sourceMetadata?.draftTranscription).toBe(true);
    expect(countNotes(imported.parts[0].measures)).toBeGreaterThan(0);
  });

  it("imports MIDI key, meter, channel, and simultaneous notes without overfilling measures", () => {
    const midiData: MidiData = {
      header: {
        format: 1,
        numTracks: 2,
        ticksPerBeat: 480
      },
      tracks: [
        [
          { deltaTime: 0, meta: true, type: "trackName", text: "Metadata" },
          { deltaTime: 0, meta: true, type: "keySignature", key: 1, scale: 0 },
          { deltaTime: 0, meta: true, type: "timeSignature", numerator: 4, denominator: 8, metronome: 24, thirtyseconds: 8 },
          { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500000 },
          { deltaTime: 0, meta: true, type: "endOfTrack" }
        ],
        [
          { deltaTime: 0, meta: true, type: "trackName", text: "Chord Track" },
          { deltaTime: 0, type: "programChange", channel: 3, programNumber: 0 },
          { deltaTime: 0, type: "noteOn", channel: 3, noteNumber: 60, velocity: 100 },
          { deltaTime: 0, type: "noteOn", channel: 3, noteNumber: 64, velocity: 100 },
          { deltaTime: 0, type: "noteOn", channel: 3, noteNumber: 67, velocity: 100 },
          { deltaTime: 240, type: "noteOff", channel: 3, noteNumber: 60, velocity: 0 },
          { deltaTime: 0, type: "noteOff", channel: 3, noteNumber: 64, velocity: 0 },
          { deltaTime: 0, type: "noteOff", channel: 3, noteNumber: 67, velocity: 0 },
          { deltaTime: 720, type: "noteOn", channel: 3, noteNumber: 72, velocity: 100 },
          { deltaTime: 480, type: "noteOff", channel: 3, noteNumber: 72, velocity: 0 },
          { deltaTime: 0, meta: true, type: "endOfTrack" }
        ]
      ]
    };

    const score = midiToAst(new Uint8Array(writeMidi(midiData)), { title: "Imported Metadata" });
    const firstMeasureEvents = score.parts[0].measures[0].events;
    const validation = validateScore(score);

    expect(score.global.key).toEqual({ tonic: "G", mode: "major" });
    expect(score.global.timeSignature).toEqual({ beats: 4, beatType: 8 });
    expect(score.parts[0].channel).toBe(3);
    expect(firstMeasureEvents[0].type).toBe("chord");
    expect(firstMeasureEvents[0].type === "chord" ? firstMeasureEvents[0].pitches.length : 0).toBe(3);
    expect(validation.errors).toEqual([]);
  });

  it("creates Learning Web compatible questions", () => {
    const pack = astToLearningPack(simpleMelodyAst);
    expect(pack.subject).toBe("Music");
    expect(pack.activityType).toBe("music-score");
    expect(pack.questions.some((question) => question.type === "note-reading")).toBe(true);
  });

  it("loads the static chord library index", () => {
    const publicIndex = JSON.parse(readFileSync("apps/studio/public/chords/chord-library-index.json", "utf8")) as Array<{ license: string; progression?: string }>;
    expect(publicIndex.length).toBeGreaterThan(0);
    expect(publicIndex[0].license).toBe("MIT");
    expect(getDemoChordLibraryIndex()[0].progression).toBe("I V vi IV");
  });

  it("detects chord names and roman numerals", () => {
    expect(detectChordName([
      { step: "C", octave: 4 },
      { step: "E", octave: 4 },
      { step: "G", octave: 4 }
    ])).toBe("C");
    expect(detectRomanNumeral("G", "C major")).toBe("V");
    expect(detectRomanNumeral("Am", "C major")).toBe("vi");
  });

  it("converts chord progressions to AST and MusicXML harmony", () => {
    const score = chordProgressionToAst(getDemoChordLibraryIndex()[0], { key: "C", mode: "major", tempo: 96 });
    const chord = score.parts[0].measures[0].events[0];
    const xml = astToMusicXml(score);
    const playbackEvents = astToPlaybackEvents(score);
    const pack = astToLearningPack(score);

    expect(score.parts[0].id).toBe("chords");
    expect(chord.type).toBe("chord");
    expect(chord.type === "chord" ? chord.semantic?.roman : "").toBe("I");
    expect(xml).toContain("<harmony>");
    expect(xml).toContain("<kind>major</kind>");
    expect(playbackEvents.filter((event) => event.startBeat === 0).length).toBe(3);
    expect(pack.questions.some((question) => question.type === "chord-function")).toBe(true);
  });

  it("exports chord events as simultaneous notes while validating duration once", () => {
    const score = structuredClone(simpleMelodyAst);
    score.parts[0].measures = [
      {
        number: 1,
        events: [
          {
            id: "test-c-major",
            type: "chord",
            pitches: [
              { step: "C", octave: 4 },
              { step: "E", octave: 4 },
              { step: "G", octave: 4 }
            ],
            duration: { value: "quarter", beats: 1 },
            semantic: { chordName: "C" }
          },
          {
            id: "test-rest",
            type: "rest",
            duration: { value: "dotted-half", beats: 3 }
          }
        ]
      }
    ];

    const issue = validateScoreMeasures(score)[0];
    const xml = astToMusicXml(score);
    const playbackEvents = astToPlaybackEvents(score).filter((event) => !event.isRest);
    const midi = new Midi(astToMidi(score));
    const midiStarts = midi.tracks[0].notes.map((note) => note.time);

    expect(issue).toMatchObject({ status: "complete", beatsUsed: 4, beatsExpected: 4 });
    expect((xml.match(/<chord\/>/g) ?? []).length).toBe(2);
    expect(playbackEvents.map((event) => [event.pitch, event.startBeat])).toEqual([
      ["C4", 0],
      ["E4", 0],
      ["G4", 0]
    ]);
    expect(new Set(midiStarts).size).toBe(1);
    expect(midi.tracks[0].notes.map((note) => note.midi).sort((a, b) => a - b)).toEqual([60, 64, 67]);
  });

  it("supports multi-track playback and MIDI export with mute solo and channels", () => {
    const score = structuredClone(simpleMelodyAst);
    score.parts = [
      {
        ...score.parts[0],
        id: "melody",
        name: "Melody",
        channel: 0,
        instrument: { name: "Piano", midiProgram: 1 }
      },
      {
        id: "bass",
        name: "Bass",
        instrument: { name: "Bass", midiProgram: 34 },
        clef: "bass",
        channel: 2,
        muted: true,
        measures: [
          {
            number: 1,
            events: [
              {
                id: "bass-c",
                type: "note",
                pitch: { step: "C", octave: 2 },
                duration: { value: "whole", beats: 4 }
              }
            ]
          }
        ]
      },
      {
        id: "guitar",
        name: "Guitar",
        instrument: { name: "Guitar", midiProgram: 25 },
        clef: "treble",
        channel: 3,
        solo: true,
        measures: [
          {
            number: 1,
            events: [
              {
                id: "guitar-c",
                type: "note",
                pitch: { step: "E", octave: 3 },
                duration: { value: "whole", beats: 4 }
              }
            ]
          }
        ]
      }
    ];

    const playbackEvents = astToPlaybackEvents(score).filter((event) => !event.isRest);
    const midi = new Midi(astToMidi(score));

    expect(playbackEvents.map((event) => event.partId)).toEqual(["guitar"]);
    expect(playbackEvents[0]).toMatchObject({ channel: 3, midiProgram: 24, midiBank: 0, instrument: "guitar" });
    expect(midi.tracks).toHaveLength(1);
    expect(midi.tracks[0].name).toBe("Guitar");
    expect(midi.tracks[0].channel).toBe(3);
    expect(midi.tracks[0].instrument.number).toBe(24);
  });

  it("imports chord MIDI into chord AST events", () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 2, velocity: 0.8 });
    track.addNote({ midi: 64, time: 0, duration: 2, velocity: 0.8 });
    track.addNote({ midi: 67, time: 0, duration: 2, velocity: 0.8 });
    track.addNote({ midi: 67, time: 2, duration: 2, velocity: 0.8 });
    track.addNote({ midi: 71, time: 2, duration: 2, velocity: 0.8 });
    track.addNote({ midi: 74, time: 2, duration: 2, velocity: 0.8 });

    const score = importChordMidiToAst(new Uint8Array(midi.toArray()), { title: "Test Chords", key: "C major" });
    const events = score.parts[0].measures.flatMap((measure) => measure.events).filter((event) => event.type === "chord");

    expect(score.parts[0].id).toBe("chords");
    expect(events.length).toBe(2);
    expect(events[0].type === "chord" ? events[0].semantic?.chordName : "").toBe("C");
    expect(events[1].type === "chord" ? events[1].semantic?.roman : "").toBe("V");
  });

  it("transposes chord progressions and exports them to MIDI", () => {
    expect(transposeProgressionChordNames(["C", "G", "Am", "F"], 2)).toEqual(["D", "A", "Bm", "G"]);
    const score = chordProgressionToAst(getDemoChordLibraryIndex()[0], { key: "D", mode: "major" });
    const bytes = astToMidi(score);
    const midi = new Midi(bytes);
    expect(bytes.length).toBeGreaterThan(20);
    expect(midi.tracks[0].notes.length).toBeGreaterThanOrEqual(12);
  });
});
