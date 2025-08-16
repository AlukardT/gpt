import type { I18n } from '@uppy/utils/lib/Translator';
import { h } from 'preact';
interface RecordButtonProps {
    recording: boolean;
    onStartRecording: () => void;
    onStopRecording: () => void;
    i18n: I18n;
}
export default function RecordButton({ recording, onStartRecording, onStopRecording, i18n, }: RecordButtonProps): h.JSX.Element;
export {};
//# sourceMappingURL=RecordButton.d.ts.map