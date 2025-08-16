import type { Body, Meta, UppyFile } from '@uppy/core';
import type { I18n } from '@uppy/utils/lib/Translator';
import Cropper from 'cropperjs';
import { Component, h } from 'preact';
import type ImageEditor from './ImageEditor.js';
type Props<M extends Meta, B extends Body> = {
    currentImage: UppyFile<M, B>;
    storeCropperInstance: (cropper: Cropper) => void;
    opts: ImageEditor<M, B>['opts'];
    i18n: I18n;
    save: () => void;
};
type State = {
    angle90Deg: number;
    angleGranular: number;
    prevCropboxData: Cropper.CropBoxData | null;
};
export default class Editor<M extends Meta, B extends Body> extends Component<Props<M, B>, State> {
    imgElement: HTMLImageElement;
    cropper: Cropper;
    constructor(props: Props<M, B>);
    componentDidMount(): void;
    componentWillUnmount(): void;
    storePrevCropboxData(): void;
    limitCropboxMovement(event: {
        detail: {
            action: string;
        };
    }): void;
    onRotate90Deg: () => void;
    onRotateGranular: (ev: Event) => void;
    renderGranularRotate(): h.JSX.Element;
    renderRevert(): h.JSX.Element;
    renderRotate(): h.JSX.Element;
    renderFlip(): h.JSX.Element;
    renderZoomIn(): h.JSX.Element;
    renderZoomOut(): h.JSX.Element;
    renderCropSquare(): h.JSX.Element;
    renderCropWidescreen(): h.JSX.Element;
    renderCropWidescreenVertical(): h.JSX.Element;
    render(): h.JSX.Element;
}
export {};
//# sourceMappingURL=Editor.d.ts.map