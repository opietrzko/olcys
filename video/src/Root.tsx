import React, { useEffect, useState } from 'react';
import { Composition, continueRender, delayRender } from 'remotion';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { EditPlayer, editLength, type Edit } from './edit';
import { FPS, H, W } from './theme';
import { SCEN_A, SCEN_B, TEASER } from './videos';

const WithFonts: React.FC<{ edit: Edit }> = ({ edit }) => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all(['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 40px "Geist Variable"`)).concat(document.fonts.load('400 30px "Geist Mono Variable"'))).finally(() => continueRender(handle));
  }, [handle]);
  return <EditPlayer edit={edit} />;
};

const VIDEOS: [string, Edit][] = [
  ['Teaser', TEASER],
  ['ScenariuszA', SCEN_A],
  ['ScenariuszB', SCEN_B],
];

export const Root: React.FC = () => (
  <>
    {VIDEOS.map(([id, edit]) => (
      <Composition key={id} id={id} component={WithFonts} defaultProps={{ edit }} durationInFrames={editLength(edit)} fps={FPS} width={W} height={H} />
    ))}
  </>
);
