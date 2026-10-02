<script lang="ts">
  import Explorer from '../components/Explorer.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { INITIAL_FORM } from './image-picker-form';
  import type { IForm } from './image-picker-form';
  import ImagePickerLaunch from './ImagePickerLaunch.svelte';
  import ImagePickerOptions from './ImagePickerOptions.svelte';
  import ImagePickerPermissions from './ImagePickerPermissions.svelte';

  const ROUTE = ROUTE_NAME.ImagePicker;
  const color = lineColorOf(ROUTE);

  let form = $state<IForm>({ ...INITIAL_FORM });

  function setForm(patch: Partial<IForm>): void {
    Object.assign(form, patch);
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="image-picker-scroll"
  title="Image Picker"
  body="Let users pick photos and videos from the library or shoot them with the camera, with optional cropping, several selections and video presets."
>
  <ImagePickerLaunch {form} {color} />
  <Explorer testID="image-picker-explorer" {color}>
    <ImagePickerPermissions />
    <ImagePickerOptions {form} {setForm} {color} />
  </Explorer>
</ScreenShell>
