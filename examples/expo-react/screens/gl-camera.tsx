import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from '@symbiote-native/camera/react';
import type { ICameraViewHandle } from '@symbiote-native/camera/react';
import { GLView } from '@symbiote-native/gl/react';
import type { IExpoWebGLRenderingContext, IGLViewHandle } from '@symbiote-native/gl/react';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ChoiceRow, ResultRow } from '../components/ScreenShell';
import { FILTERS, errorLine, useFrameLoop } from './gl-scenes';
import { cameraScene } from './gl-shaders';

export function CameraTextureScenario({ color }: { color: string }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<ICameraViewHandle>(null);
  const glView = useRef<IGLViewHandle>(null);
  const context = useRef<IExpoWebGLRenderingContext | null>(null);
  const mode = useRef(0);
  const { fps, start } = useFrameLoop();
  const [filter, setFilter] = useState(0);
  const [line, setLine] = useState('not started');

  const startFilter = () => {
    const node = camera.current?.getHostNode() ?? null;
    const gl = context.current;
    if (node === null || gl === null) {
      setLine('the camera or the GL surface is not ready yet');
      return;
    }
    setLine('creating the texture…');
    glView.current
      ?.createCameraTextureAsync(node)
      .then(texture => {
        start(cameraScene(gl, texture, () => mode.current));
        setLine('live');
      })
      .catch((error: unknown) => setLine(`failed: ${errorLine(error)}`));
  };

  return (
    <Scenario
      testID="gl-camera-scenario"
      title="Filter the live camera picture on the GPU"
      why="Camera filters, AR overlays and video effects take every camera frame as a texture and draw it through a shader, so the effect keeps up with the preview."
      steps={['Allow the camera', 'Press Start live filter', 'Switch between grey, sepia and invert']}
      expect="The GL view below shows the camera picture, recolored by the chosen filter, and keeps updating. The frame rate line counts the drawn frames."
    >
      {permission?.granted === true ? (
        <>
          <CameraView testID="gl-camera-source" ref={camera} className="gl-camera-source" />
          <GLView
            testID="gl-camera-view"
            ref={glView}
            className="gl-view"
            onContextCreate={gl => {
              context.current = gl;
            }}
          />
          <ActionButton testID="gl-camera-start" title="Start live filter" color={color} onPress={startFilter} />
          <ChoiceRow
            testID="gl-camera-filter"
            label="filter"
            color={color}
            value={filter}
            options={FILTERS}
            onChange={value => {
              mode.current = value;
              setFilter(value);
            }}
          />
        </>
      ) : (
        <ActionButton testID="gl-camera-allow" title="Allow the camera" color={color} onPress={() => void requestPermission()} />
      )}
      <ResultRow testID="gl-camera-status" label="createCameraTextureAsync" value={line} />
      <ResultRow testID="gl-camera-fps" label="Frames per second" value={String(fps)} />
      <text className="hero-body">Needs a device with a camera: the iOS simulator has none.</text>
    </Scenario>
  );
}
