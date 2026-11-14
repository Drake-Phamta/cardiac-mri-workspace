// The "About this data" sheet of SCR-01 and SCR-07: the shared bottom Sheet with the sections of about.mjs.
// The Close button and the Android back button close it.

import React from 'react';

import DetailsSheet from '../../components/DetailsSheet';

export default function AboutDataSheet({ visible, sections, onClose }) {
  return <DetailsSheet visible={visible} onClose={onClose} title="About this data" sections={sections} testID="about-data" />;
}
