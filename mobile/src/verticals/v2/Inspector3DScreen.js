import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { STATE } from '../../../../app/core/index.mjs';
import useCall from '../../runtime/useCall';
import { StatePanel } from '../../ui/StateView';
import { color, font, MIN_TOUCH, space } from '../../ui/theme';
import { meshAvailability, MESH_STATE, sliceLabel, sourceMaskIdForVariant } from './inspector3d.mjs';
import usePredictionOverlay from './usePredictionOverlay';

const variants = ['RAW', 'PROCESSED'];

export default function Inspector3DScreen({ runtime, nav, params }) {
  const caseId = params.caseId;
  const runId = params.runId;
  const caseCall = useCall(runtime.client, 'case_get', { case_id: caseId });
  const runCall = useCall(runtime.client, 'analysis_run_get', { run_id: runId });
  const caseData = caseCall.view.state === STATE.SUCCESS ? caseCall.view.data : null;
  const runData = runCall.view.state === STATE.SUCCESS ? runCall.view.data : null;
  const shape = caseData && Array.isArray(caseData.shape) ? caseData.shape : null;
  const total = shape && Number.isInteger(shape[2]) ? shape[2] : null;
  const [sliceIndex, setSliceIndex] = useState(() => Number.isInteger(params.sliceIndex) ? params.sliceIndex : 0);
  const [variant, setVariant] = useState(variants.includes(params.variant) ? params.variant : null);
  const [maskVisible, setMaskVisible] = useState(true);
  const selectedVariant = variant || (runData && runData.raw_prediction_artifact_id ? 'RAW' : null);
  const maskId = sourceMaskIdForVariant(runData, selectedVariant);
  const runReady = runData && runData.status === 'SUCCEEDED';

  useEffect(() => {
    if (total && sliceIndex >= total) setSliceIndex(Math.max(0, total - 1));
  }, [total, sliceIndex]);

  const mriCall = useCall(runtime.client, 'mri_slice_get',
    { case_id: caseId, slice_index: String(sliceIndex) }, { enabled: Boolean(caseData && total) });
  const predictionCall = useCall(runtime.client, 'prediction_slice_get',
    { run_id: runId, slice_index: String(sliceIndex), variant: selectedVariant },
    { enabled: Boolean(runReady && maskId && selectedVariant && Number.isInteger(sliceIndex)) });
  const reconstructionCall = useCall(runtime.client, 'reconstruction_get',
    // `mask_id` is the client parameter name; the contract maps it to the
    // server's `source_mask_id` query parameter.
    { run_id: runId, mask_id: maskId }, { enabled: Boolean(runReady && maskId) });
  const mriRef = mriCall.view.state === STATE.SUCCESS ? mriCall.view.data : null;
  const predictionRef = predictionCall.view.state === STATE.SUCCESS ? predictionCall.view.data : null;

  const [imageUri, setImageUri] = useState(null);
  const [imageError, setImageError] = useState(null);
  useEffect(() => {
    setImageUri(null);
    setImageError(null);
    if (!mriRef || !mriRef.content_url || !runtime.imageStore) return undefined;
    let alive = true;
    runtime.imageStore.load(mriRef.content_url, { checksum: mriRef.checksum }).then(
      (value) => { if (alive) setImageUri(value.uri); },
      (error) => { if (alive) setImageError(String(error && error.message)); },
    );
    return () => { alive = false; };
  }, [mriRef, runtime.imageStore]);

  const overlay = usePredictionOverlay(runtime.maskStore, predictionRef,
    shape ? { width: shape[0], height: shape[1] } : null);
  const mesh = maskId
    ? meshAvailability(reconstructionCall.view, runtime.contract.contractVersion)
    : { state: MESH_STATE.NO_SOURCE, message: 'This run has no prediction artifact for the selected variant.' };

  if (caseCall.view.state !== STATE.SUCCESS) {
    return <StatePanel view={caseCall.view} what={`case ${caseId}`} onAction={(id) => ['RETRY', 'REFRESH'].includes(id) && caseCall.refetch()} />;
  }
  if (runCall.view.state !== STATE.SUCCESS) {
    return <StatePanel view={runCall.view} what={`analysis run ${runId}`} onAction={(id) => ['RETRY', 'REFRESH'].includes(id) && runCall.refetch()} />;
  }

  const step = (delta) => {
    if (!Number.isInteger(total)) return;
    setSliceIndex((current) => Math.max(0, Math.min(total - 1, current + delta)));
  };
  const openSourceViewer = () => nav.push('SCR-03', {
    caseId, runId, variant: selectedVariant || undefined, sliceIndex,
  });
  const geometryText = caseData.geometry_validation_status === 'GEOMETRY_NOT_VALIDATED'
    ? 'Voxel-index coordinates · physical spacing/orientation not validated'
    : `Geometry ${caseData.geometry_validation_status || 'unknown'}`;
  const geometryBadge = caseData.geometry_validation_status === 'VALIDATED_AXIS_ALIGNED'
    ? 'AXIS-ALIGNED GEOMETRY VALIDATED'
    : 'GEOMETRY NOT VALIDATED';
  const sliceText = sliceLabel(sliceIndex, total);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.titleBlock}>
        <Text style={styles.eyebrow}>SCR-05 · MRI REVIEW</Text>
        <Text style={styles.title}>Source MRI and segmentation</Text>
        <Text style={styles.subTitle}>Case {caseId} · Run {runId}</Text>
      </View>

      <View style={styles.notice} accessibilityRole="alert">
        <Text style={styles.noticeTitle}>MRI is the source image</Text>
        <Text style={styles.noticeBody}>MRI is shown as the reading source. Segmentation is a derived layer. This API supplies one 2D raster slice; physical orientation is not validated.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View>
            <Text style={styles.sectionTitle}>Source MRI slice</Text>
            <Text style={styles.meta}>{sliceText}</Text>
          </View>
          <View style={styles.stepControls}>
            <ActionButton label="−" accessibilityLabel="Previous source slice" onPress={() => step(-1)} disabled={sliceIndex <= 0} />
            <ActionButton label="+" accessibilityLabel="Next source slice" onPress={() => step(1)} disabled={!total || sliceIndex >= total - 1} />
          </View>
        </View>

        <View style={[styles.imageFrame, shape && { aspectRatio: shape[0] / shape[1] }]} accessibilityLabel={`MRI source slice ${sliceIndex}`}>
          {imageUri ? <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="contain" fadeDuration={0} /> : null}
          {maskVisible && overlay.path && shape ? (
            <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${shape[0]} ${shape[1]}`} preserveAspectRatio="xMidYMid meet" pointerEvents="none">
              <Path d={overlay.path} fill="#ff8c42" fillOpacity={0.38} stroke="#ffb36b" strokeWidth={1.4} />
            </Svg>
          ) : null}
          <View pointerEvents="none" style={styles.viewportTop}>
            <Text style={styles.viewportTag}>MRI SOURCE</Text>
            <Text style={styles.viewportTag}>Z INDEX {sliceIndex}</Text>
          </View>
          <View pointerEvents="none" style={styles.viewportBottom}>
            <Text style={styles.viewportTag}>{shape ? `${shape[0]} × ${shape[1]} px` : 'Pixel matrix unavailable'}</Text>
            <Text style={styles.viewportTag}>{geometryBadge}</Text>
          </View>
          {!imageUri ? (
            <View style={styles.imageMessage}>
              <Text style={styles.imageMessageTitle}>{runtime.mode === 'fixture' ? 'Fixture has no image bytes' : 'MRI image unavailable'}</Text>
              <Text style={styles.imageMessageText}>{imageError || (runtime.mode === 'fixture' ? 'Fixture mode includes response examples, not MRI pixels.' : mriCall.view.state === STATE.SUCCESS ? 'Waiting for checksum-verified slice bytes.' : 'The selected source slice could not be loaded.')}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.legendRow}>
          {maskVisible ? <View style={styles.legendDot} /> : null}
          <Text style={styles.legendText}>{selectedVariant ? `${selectedVariant} prediction mask${maskVisible ? '' : ' hidden'}` : 'Select a prediction variant'}</Text>
          <Text style={styles.legendText}>{maskVisible && overlay.status === 'ready' ? 'Overlay loaded' : maskVisible && overlay.status === 'loading' ? 'Overlay loading' : ''}</Text>
        </View>

        <Text style={styles.meta}>{geometryText}</Text>
        <Text style={styles.meta}>Displayed MRI and mask slices use content URLs and checksum verification through the app runtime.</Text>

        <View style={styles.variantRow}>
          <ActionButton label={maskVisible ? 'Hide segmentation' : 'Show segmentation'} accessibilityLabel={maskVisible ? 'Hide segmentation overlay' : 'Show segmentation overlay'}
            onPress={() => setMaskVisible((visible) => !visible)} selected={maskVisible} disabled={!predictionRef} />
          {variants.map((item) => (
            <ActionButton key={item} label={item} onPress={() => setVariant(item)} selected={selectedVariant === item}
              disabled={!runData[ item === 'RAW' ? 'raw_prediction_artifact_id' : 'processed_prediction_artifact_id' ]} />
          ))}
          <ActionButton label="Open full 2D viewer" onPress={openSourceViewer} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>3D segmentation surface</Text>
        <Text style={styles.meta}>Derived geometry · Source mask {maskId || 'unavailable'}</Text>
        {mesh.state === MESH_STATE.METADATA_READY ? (
          <View style={styles.meshReady}>
            <Text style={styles.readyTitle}>Mesh reference metadata available</Text>
            <Text style={styles.meta}>The 3D renderer remains unavailable until it verifies the downloaded mesh bytes, geometry frame and in-artifact face-to-slice map.</Text>
          </View>
        ) : (
          <View style={styles.meshUnavailable} accessibilityRole="alert">
            <Text style={styles.unavailableTitle}>{mesh.state === MESH_STATE.LOADING ? 'Checking mesh availability' : '3D preview unavailable'}</Text>
            <Text style={styles.unavailableBody}>{mesh.message}</Text>
            <Text style={styles.meta}>Contract 1.2.0 proposal adds the verified mesh artifact and exact triangle → source-slice mapping. Current contract: {runtime.contract.contractVersion}.</Text>
          </View>
        )}
        <Text style={styles.meta}>Changing z above selects the MRI/source-mask slice. A 3D plane or tap-to-slice link is not claimed while this mesh artifact is unavailable.</Text>
      </View>
    </ScrollView>
  );
}

function ActionButton({ label, accessibilityLabel, onPress, disabled = false, selected = false }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} disabled={disabled}
      onPress={onPress} style={[styles.button, selected && styles.buttonSelected, disabled && styles.buttonDisabled]}>
      <Text style={[styles.buttonText, selected && styles.buttonTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.l, paddingBottom: space.xl, gap: space.m },
  titleBlock: { gap: space.xs },
  eyebrow: { color: color.info, fontFamily: font.mono, fontSize: font.small, letterSpacing: 0.7 },
  title: { color: color.text, fontSize: font.h1, fontWeight: '700' },
  subTitle: { color: color.textDim, fontSize: font.body },
  notice: { padding: space.m, borderRadius: 8, borderWidth: 1, borderColor: '#51402d', backgroundColor: '#211a13', gap: space.xs },
  noticeTitle: { color: '#ffcf9d', fontSize: font.body, fontWeight: '700' },
  noticeBody: { color: color.text, fontSize: font.small, lineHeight: 18 },
  card: { padding: space.m, borderRadius: 10, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, gap: space.m },
  cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  sectionTitle: { color: color.text, fontSize: font.h2, fontWeight: '700' },
  meta: { color: color.textDim, fontSize: font.small, lineHeight: 17 },
  stepControls: { flexDirection: 'row', gap: space.s },
  imageFrame: { width: '100%', minHeight: 220, maxHeight: 410, backgroundColor: '#000', borderRadius: 2, overflow: 'hidden', borderWidth: 1, borderColor: '#56616d', justifyContent: 'center', alignItems: 'center' },
  viewportTop: { position: 'absolute', left: 8, right: 8, top: 8, flexDirection: 'row', justifyContent: 'space-between' },
  viewportBottom: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  viewportTag: { color: '#f1f4f6', backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 5, paddingVertical: 3, fontFamily: font.mono, fontSize: 9, letterSpacing: 0.3 },
  imageMessage: { padding: space.l, alignItems: 'center', gap: space.s },
  imageMessageTitle: { color: color.text, fontWeight: '700', fontSize: font.body },
  imageMessageText: { color: color.textDim, fontSize: font.small, textAlign: 'center', lineHeight: 18 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: MIN_TOUCH / 2 },
  legendDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#ff8c42', borderWidth: 1, borderColor: '#ffb36b' },
  legendText: { color: color.textDim, fontSize: font.small },
  variantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, alignItems: 'center' },
  button: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: space.m, borderRadius: 7, borderWidth: 1, borderColor: color.border, backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  buttonSelected: { borderColor: color.accent, backgroundColor: color.accentBg },
  buttonDisabled: { opacity: 0.42 },
  buttonText: { color: color.text, fontSize: font.small, fontWeight: '600' },
  buttonTextSelected: { color: color.info },
  meshUnavailable: { minHeight: 132, padding: space.l, borderRadius: 8, borderWidth: 1, borderColor: '#51402d', backgroundColor: '#17130f', justifyContent: 'center', gap: space.s },
  unavailableTitle: { color: color.warn, fontSize: font.body, fontWeight: '700' },
  unavailableBody: { color: color.text, fontSize: font.small, lineHeight: 18 },
  meshReady: { minHeight: 110, padding: space.l, borderRadius: 8, borderWidth: 1, borderColor: color.border, justifyContent: 'center', gap: space.s },
  readyTitle: { color: color.ok, fontSize: font.body, fontWeight: '700' },
});
