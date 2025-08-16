import type { I18n } from '@uppy/utils/lib/Translator';
import { type ComponentChild, h } from 'preact';
interface PermissionScreenProps {
    hasCamera: boolean;
    icon: () => ComponentChild | null;
    i18n: I18n;
}
export default function PermissionsScreen({ icon, i18n, hasCamera, }: PermissionScreenProps): h.JSX.Element;
export {};
//# sourceMappingURL=PermissionsScreen.d.ts.map