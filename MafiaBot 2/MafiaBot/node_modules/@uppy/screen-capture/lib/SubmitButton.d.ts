import type { I18n } from '@uppy/utils/lib/Translator';
import { h } from 'preact';
interface SubmitButtonProps {
    recording: boolean;
    recordedVideo: string | null;
    onSubmit: () => void;
    i18n: I18n;
    capturedScreenshotUrl?: string | null;
}
/**
 * Submit recorded video to uppy. Enabled when file is available
 */
export default function SubmitButton({ recording, recordedVideo, onSubmit, capturedScreenshotUrl, i18n, }: SubmitButtonProps): h.JSX.Element | null;
export {};
//# sourceMappingURL=SubmitButton.d.ts.map