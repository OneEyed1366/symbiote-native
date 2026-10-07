import { Show, createSignal } from 'solid-js';
import { CameraView, useCameraPermissions } from '@symbiote-native/camera/solid';
import type { ICameraViewHandle } from '@symbiote-native/camera/solid';
import { GLView } from '@symbiote-native/gl/solid';
import type { IExpoWebGLRenderingContext, IGLViewHandle } from '@symbiote-native/gl/solid';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ChoiceRow, ResultRow } from '../components/ScreenShell';
import { FILTERS, errorLine } from './gl-frame-loop';
import { useFrameLoop } from './gl-scenes';
import { cameraScene } from './gl-shaders';

export function CameraTextureScenario(props: { color: string }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [camera, setCamera] = createSignal<ICameraViewHandle>();
  const [glView, setGlView] = createSignal<IGLViewHandle>();
  let context: IExpoWebGLRenderingContext | null = null;
  let mode = 0;
  const { view, loop } = useFrameLoop();
  const [filter, setFilter] = createSignal(0);
  const [line, setLine] = createSignal('not started');

  const startFilter = async () => {
    const node = camera()?.getHostNode() ?? null;
    const gl = context;
    if (node === null || gl === null) {
      setLine('the camera or the GL surface is not ready yet');
      return;
    }
    setLine('creating the texture…');
    try {
      const texture = await glView()?.createCameraTextureAsync(node);
      if (texture !== undefined) {
        loop.start(cameraScene(gl, texture, () => mode));
        setLine('live');
      }
    } catch (error: unknown) {
      setLine(`failed: ${errorLine(error)}`);
    }
  };
  const changeFilter = (value: number) => {
    mode = value;
    setFilter(value);
  };

  return (
    <Scenario
      testID="gl-camera-scenario"
      title="Filter the live camera picture on the GPU"
      why="Camera filters, AR overlays and video effects take every camera frame as a texture and draw it through a shader, so the effect keeps up with the preview."
      steps={['Allow the camera', 'Press Start live filter', 'Switch between grey, sepia and invert']}
      expect="The GL view below shows the camera picture, recolored by the chosen filter, and keeps updating. The frame rate line counts the drawn frames."
    >
      <Show
        when={permission()?.granted === true}
        fallback={<ActionButton testID="gl-camera-allow" title="Allow the camera" color={props.color} onPress={() => void requestPermission()} />}
      >
        <CameraView testID="gl-camera-source" ref={setCamera} class="gl-camera-source" />
        <GLView
          testID="gl-camera-view"
          ref={setGlView}
          class="gl-view"
          onContextCreate={gl => {
            context = gl;
          }}
        />
        <ActionButton testID="gl-camera-start" title="Start live filter" color={props.color} onPress={() => void startFilter()} />
        <ChoiceRow testID="gl-camera-filter" label="filter" color={props.color} value={filter()} options={FILTERS} onChange={changeFilter} />
      </Show>
      <ResultRow testID="gl-camera-status" label="createCameraTextureAsync" value={line()} />
      <ResultRow testID="gl-camera-fps" label="Frames per second" value={String(view().fps)} />
      <text class="hero-body">Needs a device with a camera: the iOS simulator has none.</text>
    </Scenario>
  );
}
