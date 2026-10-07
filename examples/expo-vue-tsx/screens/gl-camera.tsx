import { defineComponent, ref } from 'vue';
import { CameraView, useCameraPermissions } from '@symbiote-native/camera/vue';
import type { ICameraViewHandle } from '@symbiote-native/camera/vue';
import { GLView } from '@symbiote-native/gl/vue';
import type { IExpoWebGLRenderingContext, IGLViewHandle } from '@symbiote-native/gl/vue';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ChoiceRow, ResultRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { FILTERS, errorLine } from './gl-frame-loop';
import { useFrameLoop } from './gl-scenes';
import { cameraScene } from './gl-shaders';

const color = lineColorOf(ROUTE_NAME.Gl);

export const CameraTextureScenario = defineComponent(
  () => {
    const [permission, requestPermission] = useCameraPermissions();
    const camera = ref<ICameraViewHandle | null>(null);
    const glView = ref<IGLViewHandle | null>(null);
    let context: IExpoWebGLRenderingContext | null = null;
    let mode = 0;
    const { view, loop } = useFrameLoop();
    const filter = ref(0);
    const line = ref('not started');

    const startFilter = async () => {
      const node = camera.value?.getHostNode() ?? null;
      const gl = context;
      if (node === null || gl === null) {
        line.value = 'the camera or the GL surface is not ready yet';
        return;
      }
      line.value = 'creating the texture…';
      try {
        const texture = await glView.value?.createCameraTextureAsync(node);
        if (texture !== undefined) {
          loop.start(cameraScene(gl, texture, () => mode));
          line.value = 'live';
        }
      } catch (error: unknown) {
        line.value = `failed: ${errorLine(error)}`;
      }
    };
    const changeFilter = (value: number) => {
      mode = value;
      filter.value = value;
    };

    return () => (
      <Scenario
        testID="gl-camera-scenario"
        title="Filter the live camera picture on the GPU"
        why="Camera filters, AR overlays and video effects take every camera frame as a texture and draw it through a shader, so the effect keeps up with the preview."
        steps={['Allow the camera', 'Press Start live filter', 'Switch between grey, sepia and invert']}
        expect="The GL view below shows the camera picture, recolored by the chosen filter, and keeps updating. The frame rate line counts the drawn frames."
      >
        {permission.value?.granted === true ? (
          <>
            <CameraView testID="gl-camera-source" ref={camera} class="gl-camera-source" />
            <GLView
              testID="gl-camera-view"
              ref={glView}
              class="gl-view"
              onContextCreate={gl => {
                context = gl;
              }}
            />
            <ActionButton testID="gl-camera-start" title="Start live filter" color={color} onPress={() => void startFilter()} />
            <ChoiceRow testID="gl-camera-filter" label="filter" color={color} value={filter.value} options={FILTERS} onChange={changeFilter} />
          </>
        ) : (
          <ActionButton testID="gl-camera-allow" title="Allow the camera" color={color} onPress={() => void requestPermission()} />
        )}
        <ResultRow testID="gl-camera-status" label="createCameraTextureAsync" value={line.value} />
        <ResultRow testID="gl-camera-fps" label="Frames per second" value={String(view.value.fps)} />
        <text class="hero-body">Needs a device with a camera: the iOS simulator has none.</text>
      </Scenario>
    );
  },
  { name: 'CameraTextureScenario' },
);
