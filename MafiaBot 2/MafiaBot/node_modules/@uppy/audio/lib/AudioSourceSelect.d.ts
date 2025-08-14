import { h } from 'preact';
export interface AudioSourceSelectProps {
    currentDeviceId: string | MediaStreamTrack | null | undefined;
    audioSources: MediaDeviceInfo[];
    onChangeSource: (value: string) => void;
}
declare const _default: ({ currentDeviceId, audioSources, onChangeSource, }: AudioSourceSelectProps) => h.JSX.Element;
export default _default;
//# sourceMappingURL=AudioSourceSelect.d.ts.map