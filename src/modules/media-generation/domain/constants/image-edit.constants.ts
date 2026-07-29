/**
 * Hard ceiling on reference images for a single edit. Mirrors the worker's own
 * MAX_REFERENCE_IMAGES (workers/runpod-qwen-image-edit-nunchaku-worker/reference_inputs.py) and
 * the model's documented sweet spot: Qwen-Image-Edit-2509 states "optimal performance is
 * currently achieved with 1 to 3 input images".
 *
 * The first reference is the image being edited; the rest supply a subject/object/style to
 * compose into it. That ordering is load-bearing on the worker side (it pins the output
 * geometry to reference #1), so keep it stable end to end.
 */
export const MAX_EDIT_REFERENCE_IMAGES = 3;
