// Bootstrap for mse.html — the one figure reached from the word "MSE" in the
// index page's loss sentence.
//
// Unlike app.js this fetches nothing. index.html replays precomputed model
// output; here the subject IS the sampling, so the draws are generated in the
// browser from a fixed seed. Same transport module as the index panels.
import { standardNormalSamples, renderSampleHistogram } from "./plot.js";
import { attachPlay } from "./controls.js";

const SEED = 42;
const DRAWS_PER_STEP = 50; // slider 0…1000 ⇒ N = 0…50000, a constant sampling rate

const canvas = document.getElementById("expectation-canvas");
const slider = document.getElementById("n-slider");
const value = document.getElementById("n-value");
const play = document.getElementById("n-play");

// standardNormalSamples is prefix-stable, so raising N appends draws to the
// same sequence rather than resampling: the histogram thickens, it never jumps.
function render() {
  const n = (parseInt(slider.value, 10) || 0) * DRAWS_PER_STEP;
  value.textContent = String(n);
  renderSampleHistogram(canvas, standardNormalSamples(n, SEED));
}

slider.addEventListener("input", render);
attachPlay(play, slider); // enables the button and paints the track
render();
