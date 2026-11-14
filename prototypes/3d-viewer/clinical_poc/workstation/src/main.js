import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkLight from '@kitware/vtk.js/Rendering/Core/Light';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import { Corners } from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget/Constants';
import { anatomyVerified, assertFrame, voxelWorld, voxelIndex, nearestSourceLabel } from './geometry.mjs';
import { createMpr } from './mpr.js';

const $ = (id) => document.getElementById(id);
const colour = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
function fail(error) { $('error').hidden = false; $('error').textContent = error.message; $('render-status').textContent = 'Preview unavailable'; console.error(error); }
async function verifiedArray(asset, Type) {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`Cannot load ${asset.url}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== asset.bytes || bytes.byteLength % Type.BYTES_PER_ELEMENT) throw new Error(`Invalid array length: ${asset.url}`);
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((v) => v.toString(16).padStart(2, '0')).join('');
  if (digest !== asset.sha256) throw new Error(`Data integrity check failed: ${asset.url}`);
  return new Type(bytes);
}
function imageData(geometry, values) {
  if (values.length !== geometry.shape_xyz.reduce((a, b) => a * b, 1)) throw new Error('MRI scalar count differs from geometry');
  const data = vtkImageData.newInstance();
  data.setDimensions(...geometry.shape_xyz); data.setSpacing(...geometry.spacing_xyz_mm); data.setOrigin(...geometry.origin_ras_mm);
  data.getPointData().setScalars(vtkDataArray.newInstance({ name: 'MRI intensity', numberOfComponents: 1, values }));
  return data;
}
// Native-resolution MRI inside the declared 3D ROI, for the in-scene slice planes.
function roiImage(image, meta) {
  const [nx, ny] = meta.shape_xyz, min = meta.volume.crop_source_min_xyz, max = meta.volume.crop_source_max_exclusive_xyz;
  const shape = max.map((v, a) => v - min[a]), values = new Float32Array(shape[0] * shape[1] * shape[2]);
  let at = 0;
  for (let z = min[2]; z < max[2]; z += 1) for (let y = min[1]; y < max[1]; y += 1) {
    const row = z * nx * ny + y * nx; values.set(image.subarray(row + min[0], row + max[0]), at); at += shape[0];
  }
  return { min, shape, data: imageData({ shape_xyz: shape, spacing_xyz_mm: meta.spacing_xyz_mm, origin_ras_mm: voxelWorld(min, meta) }, values) };
}
const MODES = {
  surface: { surfaces: true, volume: false, caption: 'Label-derived surfaces · source MRI linked' },
  mip: { surfaces: false, volume: true, caption: 'MRI maximum intensity projection · labelled ROI + 45 mm' },
  volume: { surfaces: false, volume: true, caption: 'MRI intensity · shaded transfer-function display' },
  combined: { surfaces: true, volume: true, caption: 'Label-derived surfaces + MRI intensity context' },
};
// Face rotations keep each cube label upright with +Z up (the faces vtk.js's 'lps' preset rotates).
const FACE_ROTATION = { XPlus: 90, XMinus: -90, YPlus: 180, YMinus: 0, ZPlus: 0, ZMinus: 180 };

async function start() {
  const response = await fetch('data/meta.json'); if (!response.ok) throw new Error('Missing preview metadata');
  const meta = await response.json(); assertFrame(meta);
  const verified = anatomyVerified(meta);
  const [image, labels, intensity] = await Promise.all([verifiedArray(meta.mri, Float32Array), verifiedArray(meta.labels, Uint16Array), verifiedArray(meta.volume.scalars, Float32Array)]);
  if (labels.length !== image.length) throw new Error('Source label dimensions differ from MRI');
  const state = { selected: meta.centroid_xyz.map((v, a) => Math.max(0, Math.min(meta.shape_xyz[a] - 1, Math.round(v)))), visible: new Set(meta.segments.map((s) => s.id)), variant: 'gentle', mode: 'combined', overlay: true, window: meta.initial_window };
  const generic = vtkGenericRenderWindow.newInstance({ background: [0.023, 0.041, 0.060] });
  generic.setContainer($('vtk')); generic.resize();
  const renderer = generic.getRenderer(), renderWindow = generic.getRenderWindow(), interactor = generic.getInteractor();
  const camera = renderer.getActiveCamera();
  const volumeImage = imageData(meta.volume, intensity);
  const volumeMapper = vtkVolumeMapper.newInstance(); volumeMapper.setInputData(volumeImage);
  volumeMapper.setSampleDistance(Math.min(...meta.volume.spacing_xyz_mm) * 0.65);
  const volumeActor = vtkVolume.newInstance(); volumeActor.setMapper(volumeMapper); renderer.addVolume(volumeActor);
  const transferColour = vtkColorTransferFunction.newInstance(), transferOpacity = vtkPiecewiseFunction.newInstance();
  const volumeProperty = volumeActor.getProperty(); volumeProperty.setRGBTransferFunction(0, transferColour); volumeProperty.setScalarOpacity(0, transferOpacity);
  volumeProperty.setScalarOpacityUnitDistance(0, Math.min(...meta.volume.spacing_xyz_mm)); volumeProperty.setInterpolationTypeToLinear();
  volumeProperty.setShade(true); volumeProperty.setAmbient(0.25); volumeProperty.setDiffuse(0.75); volumeProperty.setSpecular(0.12); volumeProperty.setSpecularPower(18);
  const plane = vtkPlane.newInstance({ normal: [0, 0, -1] });
  // Opaque slice planes cropped to the ROI: a full 400 mm field at partial
  // opacity hid the anatomy it was meant to locate.
  const roi = roiImage(image, meta);
  const planeActors = [0, 1, 2].map((axis) => {
    const mapper = vtkImageMapper.newInstance(); mapper.setInputData(roi.data);
    const actor = vtkImageSlice.newInstance(); actor.setMapper(mapper); actor.setVisibility(false);
    renderer.addActor(actor); return { mapper, actor, axis };
  });
  const markerSource = vtkSphereSource.newInstance({ radius: 1.2, thetaResolution: 16, phiResolution: 16 });
  const markerMapper = vtkMapper.newInstance(); markerMapper.setInputConnection(markerSource.getOutputPort());
  const marker = vtkActor.newInstance(); marker.setMapper(markerMapper); marker.getProperty().setColor(0.40, 0.92, 0.94); marker.getProperty().setAmbient(0.7); renderer.addActor(marker);
  renderer.removeAllLights();
  for (const [position, intensityValue, tint] of [[[1, 1, 2], 0.95, [1, 0.96, 0.91]], [[-1, -0.5, 1], 0.45, [0.8, 0.89, 1]]]) {
    const light = vtkLight.newInstance(); light.setLightTypeToCameraLight(); light.setPosition(...position); light.setFocalPoint(0, 0, 0); light.setIntensity(intensityValue); light.setColor(...tint); renderer.addLight(light);
  }
  const cube = vtkAnnotatedCubeActor.newInstance(); cube.setDefaultStyle({ faceColor: '#253948', faceRotation: 0, fontStyle: 'bold', fontFamily: 'Arial', fontColor: verified ? '#d7e3e9' : '#f1c58f', fontSizeScale: (res) => res / (verified ? 2.8 : 3.6), edgeThickness: 0.08, edgeColor: '#5a7d90', resolution: 128 });
  const faces = verified ? { XPlus: 'R', XMinus: 'L', YPlus: 'A', YMinus: 'P', ZPlus: 'S', ZMinus: 'I' } : { XPlus: '+i', XMinus: '−i', YPlus: '+j', YMinus: '−j', ZPlus: '+k', ZMinus: '−k' };
  for (const [face, text] of Object.entries(faces)) cube[`set${face}FaceProperty`]({ text, faceRotation: FACE_ROTATION[face] });
  interactor.setCurrentRenderer(renderer);
  const orientation = vtkOrientationMarkerWidget.newInstance({ actor: cube, interactor, parentRenderer: renderer });
  orientation.setViewportCorner(Corners.TOP_RIGHT); orientation.setViewportSize(0.13); orientation.setMinPixelSize(60); orientation.setMaxPixelSize(95); orientation.setEnabled(true);

  let actors = [], generation = 0;
  const cache = new Map(), picker = vtkCellPicker.newInstance(); picker.setPickFromList(true); picker.setTolerance(0.0005);
  // Near/far planes follow what is visible now; a range fitted while a layer
  // was hidden would otherwise slice through it when it is shown again.
  const render = () => { renderer.resetCameraClippingRange(); renderWindow.render(); };
  function updatePlanes() {
    const [low, high] = state.window;
    for (const { mapper, actor, axis } of planeActors) {
      const index = state.selected[axis] - roi.min[axis], inside = index >= 0 && index < roi.shape[axis];
      if (inside) mapper[['setISlice', 'setJSlice', 'setKSlice'][axis]](index);
      actor.setVisibility($('planes').checked && inside);
      actor.getProperty().setColorWindow(high - low); actor.getProperty().setColorLevel((high + low) / 2);
    }
  }
  function setVisibility() {
    const mode = MODES[state.mode];
    for (const entry of actors) entry.actor.setVisibility(mode.surfaces && state.visible.has(entry.segment.id));
    volumeActor.setVisibility(mode.volume); updatePlanes();
    $('mode-caption').textContent = mode.caption;
    $('stage-label').textContent = mode.surfaces ? meta.segments.filter((s) => state.visible.has(s.id)).map((s) => s.name.toUpperCase()).join(' / ') || 'NO VISIBLE LABELS'
      : state.mode === 'mip' ? 'SOURCE MRI · MAXIMUM INTENSITY' : 'SOURCE MRI · INTENSITY';
  }
  function clip() {
    plane.setOrigin(...voxelWorld(state.selected, meta));
    for (const mapper of [volumeMapper, ...actors.map((a) => a.mapper)]) { mapper.removeAllClippingPlanes(); if ($('clip').checked) mapper.addClippingPlane(plane); }
  }
  let mpr;
  function select() { mpr.render(); markerSource.setCenter(...voxelWorld(state.selected, meta)); updatePlanes(); clip(); render(); }
  mpr = createMpr(meta, image, labels, state, select, verified);
  function metrics() {
    const visible = meta.segments.filter((s) => state.visible.has(s.id));
    if (!visible.length) { $('metrics').textContent = 'No visible labels.'; return; }
    const rows = [];
    for (const segment of visible) {
      const r = segment.surfaces[state.variant].report;
      if (meta.segments.length > 1) { const head = document.createElement('div'), swatch = document.createElement('i'); head.className = 'metric-head'; swatch.style.background = segment.color; head.append(swatch, segment.name); rows.push(head); }
      for (const [name, value] of [['Source label', `${segment.label_volume_ml.toFixed(1)} mL`], ['Surface triangles', r.triangles.toLocaleString()], ['95% sampled deviation', `${r.hd95_vertex_sample_mm.toFixed(3)} mm`], ['Max sampled deviation', `${r.max_vertex_sample_distance_mm.toFixed(3)} mm`], ['Mesh volume change', `${r.mesh_volume_change_percent.toFixed(2)}%`], ['Boundary / non-manifold edges', `${r.boundary_edges} / ${r.non_manifold_edges}`]]) {
        const row = document.createElement('div'), key = document.createElement('span'), val = document.createElement('b'); row.className = 'metric'; key.textContent = name; val.textContent = value; row.append(key, val); rows.push(row);
      }
    }
    $('metrics').replaceChildren(...rows);
  }
  async function variant() {
    const token = ++generation; $('render-status').textContent = 'Loading reconstruction…';
    const loaded = await Promise.all(meta.segments.map(async (segment) => {
      const key = `${segment.id}/${state.variant}`;
      if (!cache.has(key)) { const spec = segment.surfaces[state.variant]; const [points, cells, normals] = await Promise.all([verifiedArray(spec.points, Float32Array), verifiedArray(spec.cells, Uint32Array), verifiedArray(spec.normals, Float32Array)]);
        if (points.length % 3 || normals.length !== points.length || cells.length % 4 || cells.some((v, at) => at % 4 === 0 ? v !== 3 : v >= points.length / 3)) throw new Error('Invalid surface connectivity');
        const poly = vtkPolyData.newInstance(); poly.getPoints().setData(points, 3); poly.getPolys().setData(cells); poly.getPointData().setNormals(vtkDataArray.newInstance({ name: 'Normals', numberOfComponents: 3, values: normals })); cache.set(key, poly);
      }
      return { segment, poly: cache.get(key) };
    }));
    if (token !== generation) return;
    for (const entry of actors) { renderer.removeActor(entry.actor); entry.actor.delete(); entry.mapper.delete(); }
    actors = loaded.map(({ segment, poly }) => { const mapper = vtkMapper.newInstance(); mapper.setInputData(poly); mapper.setScalarVisibility(false); const actor = vtkActor.newInstance(); actor.setMapper(mapper);
      const prop = actor.getProperty(); prop.setColor(...colour(segment.color)); prop.setInterpolationToPhong(); prop.setAmbient(0.2); prop.setDiffuse(0.8); prop.setSpecular(0.22); prop.setSpecularPower(32); prop.setOpacity(Number($('surface-alpha').value)); renderer.addActor(actor); return { segment, actor, mapper }; });
    picker.initializePickList(); actors.forEach(({ actor }) => picker.addPickList(actor));
    setVisibility(); clip(); metrics(); render(); $('render-status').textContent = 'Source arrays verified · ready';
  }
  function cameraView(direction = [0.8, 1, 0.45], up = [0, 0, 1]) {
    const center = voxelWorld(meta.centroid_xyz, meta);
    camera.setFocalPoint(...center); camera.setPosition(...center.map((v, a) => v + direction[a] * 250)); camera.setViewUp(...up);
    // Frame the visible labels; fall back to the MRI ROI when none are shown.
    const visible = actors.filter((entry) => entry.actor.getVisibility()), surfaces = state.mode === 'surface' && visible.length > 0;
    const bounds = surfaces ? visible.reduce((all, entry) => { const b = entry.actor.getBounds(); return all.map((v, a) => a % 2 ? Math.max(v, b[a]) : Math.min(v, b[a])); }, [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]) : volumeImage.getBounds();
    renderer.resetCamera(bounds); camera.zoom(surfaces ? 0.9 : 1.25); renderer.resetCameraClippingRange(); render();
  }
  function volumeTransfer() {
    const mip = state.mode === 'mip';
    transferColour.removeAllPoints(); transferOpacity.removeAllPoints();
    if (mip) {
      // MIP of bright-blood MRI: grey ramp over the ROI's upper intensity range.
      const [low, high] = meta.volume.mip_window;
      volumeMapper.setBlendModeToMaximumIntensity();
      transferColour.addRGBPoint(low, 0, 0, 0); transferColour.addRGBPoint(high, 1, 1, 1);
      transferOpacity.addPoint(low, 0); transferOpacity.addPoint(high, 1);
    } else {
      const [low, high] = meta.initial_window, span = high - low, threshold = low + span * Number($('threshold').value) / 100, opacity = Number($('volume-alpha').value);
      volumeMapper.setBlendModeToComposite();
      transferColour.addRGBPoint(low, 0.06, 0.09, 0.12); transferColour.addRGBPoint(threshold, 0.30, 0.34, 0.38); transferColour.addRGBPoint(threshold + (high - threshold) * 0.65, 0.78, 0.79, 0.77); transferColour.addRGBPoint(high, 0.98, 0.94, 0.85);
      transferOpacity.addPoint(low, 0); transferOpacity.addPoint(threshold, 0); transferOpacity.addPoint(Math.max(threshold + span * 1e-5, high), opacity);
      $('threshold-value').textContent = threshold.toFixed(0); $('volume-alpha-value').textContent = `${Math.round(opacity * 100)}%`;
    }
    $('threshold').disabled = $('volume-alpha').disabled = mip; render();
  }
  function windowLevel() {
    const [low, high] = meta.initial_window, width = (high - low) * Number($('window').value) / 75, level = low + (high - low) * Number($('level').value) / 100;
    state.window = [level - width / 2, level + width / 2]; $('window-value').textContent = width.toFixed(0); $('level-value').textContent = level.toFixed(0);
    select();
  }
  const source = meta.provenance, spacing = meta.spacing_xyz_mm.map((v) => v.toFixed(2)).join(' × ');
  $('case-title').textContent = `${source.dataset || 'Local MRI'} · ${source.case || ''}`;
  $('source-badge').textContent = source.source_kind === 'public-mri' ? 'PUBLIC MRI · EXPERT LABEL' : 'LOCAL MRI';
  $('resolution').textContent = `${spacing} mm · ${verified ? 'RAS' : 'array axes · orientation unverified'} · ${meta.volume.stride === 1 ? 'native 3D sampling' : `3D stride ${meta.volume.stride}`}`;
  $('scope-title').textContent = source.license || 'Source study'; $('scope').textContent = `${source.scope || ''}. 3D intensity view: labelled ROI + 45 mm context; MRI slices use the complete native grid.`;
  $('attribution').href = source.publication || source.license_url || '#'; $('attribution').textContent = `Dataset publication · ${source.license || 'local attribution'}`;
  if (!verified) {
    $('orientation-badge').hidden = false; $('orientation-badge').title = meta.orientation.basis;
    $('orientation-note').hidden = false;
    $('orientation-note').textContent = `Orientation unverified: ${meta.orientation.basis}. Plane names, R/L/A/P/S/I and anatomical camera views are hidden; millimetre distances remain valid. Rebuild with --array-axes only after confirming the anatomy.`;
  } else if (meta.orientation.status === 'operator-declared') {
    $('orientation-note').hidden = false; $('orientation-note').textContent = `Orientation declared by the operator: stored axes ${meta.orientation.array_axes} (header was a placeholder).`;
  }
  $('clip-label').textContent = verified ? 'Cut at axial slice' : 'Cut at k slice';
  const views = verified
    ? [['Anterior', [0, 1, 0], [0, 0, 1]], ['Posterior', [0, -1, 0], [0, 0, 1]], ['Left', [-1, 0, 0], [0, 0, 1]], ['Right', [1, 0, 0], [0, 0, 1]], ['Inferior', [0, 0, -1], [0, 1, 0]]]
    : [['+i', [1, 0, 0], [0, 0, 1]], ['−i', [-1, 0, 0], [0, 0, 1]], ['+j', [0, 1, 0], [0, 0, 1]], ['−j', [0, -1, 0], [0, 0, 1]], ['+k', [0, 0, 1], [0, 1, 0]]];
  for (const [name, direction, up] of views) {
    const button = document.createElement('button'); button.textContent = name; button.dataset.camera = name;
    button.title = verified ? `${name} view` : `Camera on the ${name} side of the stored array`;
    button.addEventListener('click', () => cameraView(direction, up)); $('camera-buttons').append(button);
  }
  for (const segment of meta.segments) {
    const row = document.createElement('label'); row.className = 'segment'; const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = true; checkbox.dataset.label = segment.id;
    const swatch = document.createElement('i'); swatch.className = 'swatch'; swatch.style.background = segment.color; const name = document.createElement('span'); name.className = 'label'; name.textContent = segment.name; const value = document.createElement('small'); value.textContent = `${segment.label_volume_ml.toFixed(1)} mL`;
    row.append(checkbox, swatch, name, value); $('segments').append(row);
    checkbox.addEventListener('change', () => { checkbox.checked ? state.visible.add(segment.id) : state.visible.delete(segment.id); setVisibility(); metrics(); select(); });
  }
  $('variant').addEventListener('change', () => { state.variant = $('variant').value; variant().catch(fail); });
  for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => { state.mode = button.dataset.mode; document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === button)); setVisibility(); volumeTransfer(); });
  $('fit').addEventListener('click', () => cameraView());
  $('planes').addEventListener('change', () => { updatePlanes(); render(); }); $('clip').addEventListener('change', () => { clip(); render(); });
  $('surface-alpha').addEventListener('input', () => { actors.forEach(({ actor }) => actor.getProperty().setOpacity(Number($('surface-alpha').value))); $('surface-alpha-value').textContent = `${Math.round(Number($('surface-alpha').value) * 100)}%`; render(); });
  $('overlay').addEventListener('change', () => { state.overlay = $('overlay').checked; mpr.render(); });
  for (const id of ['threshold', 'volume-alpha']) $(id).addEventListener('input', volumeTransfer);
  for (const id of ['window', 'level']) $(id).addEventListener('input', windowLevel);
  let down;
  $('vtk').addEventListener('pointerdown', (event) => { down = [event.clientX, event.clientY]; });
  function resolve(point, labelId) {
    const segment = meta.segments.find((s) => s.id === labelId);
    if (!segment || !state.visible.has(labelId)) return null;
    // This is an explicit proximity lookup, not a borrowed face ID from the voxel mesh.
    const maximum = segment.surfaces[state.variant].report.max_vertex_sample_distance_mm + Math.hypot(...meta.spacing_xyz_mm) / 2 + 0.05;
    const match = nearestSourceLabel(point, labelId, labels, meta, maximum);
    if (!match) { $('pick-status').textContent = 'No nearby source-label voxel. Crosshair unchanged.'; return null; }
    state.selected.splice(0, 3, ...match.ijk); $('pick-status').textContent = `${segment.name} → source IJK ${match.ijk.join(', ')} · ${match.distanceMm.toFixed(2)} mm to voxel centre`; select(); return match;
  }
  $('vtk').addEventListener('pointerup', (event) => {
    if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 4 || !MODES[state.mode].surfaces) return;
    const canvas = generic.getApiSpecificRenderWindow().getCanvas(), rect = canvas.getBoundingClientRect();
    picker.pick([(event.clientX - rect.left) * canvas.width / rect.width, (rect.bottom - event.clientY) * canvas.height / rect.height, 0], renderer);
    // vtk.js 37 pick() updates picker state and has no boolean return value.
    const entry = actors.find((a) => picker.getActors()[0] === a.actor && a.actor.getVisibility());
    if (picker.getCellId() >= 0 && entry) resolve(picker.getPickPosition(), entry.segment.id);
  });
  const resize = new ResizeObserver(() => { generic.resize(); mpr.render(); render(); });
  resize.observe($('stage')); resize.observe(document.querySelector('.mpr-stack'));
  await variant(); volumeTransfer(); windowLevel(); cameraView();
  $('renderer').textContent = generic.getApiSpecificRenderWindow().getWebgl2?.() ? 'WebGL2' : 'WebGL';
  window.previewDebug = { meta, state, verified, sourceVoxel: (ijk) => ({ value: image[voxelIndex(ijk, meta.shape_xyz)], label: labels[voxelIndex(ijk, meta.shape_xyz)] }), resolve, getSurfaceBounds: () => actors.map((a) => a.actor.getBounds()),
    clippingCoversSurfaces: () => {
      const [near, far] = camera.getClippingRange(), position = camera.getPosition(), dop = camera.getDirectionOfProjection();
      const depths = actors.filter((a) => a.actor.getVisibility()).flatMap((a) => { const b = a.actor.getBounds(); return [0, 1].flatMap((i) => [2, 3].flatMap((j) => [4, 5].map((k) => [b[i], b[j], b[k]]))); })
        .map((p) => p.reduce((sum, v, a) => sum + (v - position[a]) * dop[a], 0));
      return { near, far, min: Math.min(...depths), max: Math.max(...depths), covers: depths.length > 0 && near <= Math.min(...depths) + 1e-6 && far >= Math.max(...depths) - 1e-6 };
    },
    worldToDisplay: (point) => { const view = generic.getApiSpecificRenderWindow(); const [x, y] = view.worldToDisplay(...point, renderer); const canvas = view.getCanvas(), rect = canvas.getBoundingClientRect(); return [rect.left + x * rect.width / canvas.width, rect.bottom - y * rect.height / canvas.height]; } };
  window.previewReady = true;
}
start().catch(fail);
