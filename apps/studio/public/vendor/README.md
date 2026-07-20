# Vendor Runtime Assets

`libfluidsynth-2.4.6.js` is copied from `js-synthesizer/externals` so the dev server can load FluidSynth from a plain same-origin public URL.

FluidSynth is LGPL-2.1; keep `LICENSE.fluidsynth.txt` beside the runtime file.

`js-synthesizer.worklet.js` is copied from `js-synthesizer/dist` so Direct SF2 playback can render through AudioWorklet instead of the older main-thread ScriptProcessor path.

js-synthesizer is BSD-3-Clause; keep `LICENSE.js-synthesizer.txt` beside the worklet runtime file.
