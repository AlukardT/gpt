import type { I18n } from '@uppy/utils/lib/Translator';
import { h } from 'preact';
import { type AudioSourceSelectProps } from './AudioSourceSelect.js';
interface RecordingScreenProps extends AudioSourceSelectProps {
    stream: MediaStream | null | undefined;
    recordedAudio: string | null | undefined;
    recording: boolean;
    supportsRecording: boolean;
    showAudioSourceDropdown: boolean | undefined;
    onSubmit: () => void;
    i18n: I18n;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onStop: () => void;
    onDiscardRecordedAudio: () => void;
    recordingLengthSeconds: number;
}
export default function RecordingScreen(props: RecordingScreenProps): h.JSX.Element;
export {};
//# sourceMappingURL=RecordingScreen.d.ts.map