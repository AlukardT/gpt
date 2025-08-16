import DragDropPlugin, {} from '@uppy/drag-drop';
import { Component, createElement as h } from 'react';
import getHTMLProps from './getHTMLProps.js';
import nonHtmlPropsHaveChanged from './nonHtmlPropsHaveChanged.js';
/**
 * React component that renders an area in which files can be dropped to be
 * uploaded.
 */
class DragDrop extends Component {
    container;
    plugin;
    componentDidMount() {
        this.installPlugin();
    }
    componentDidUpdate(prevProps) {
        if (prevProps.uppy !== this.props.uppy) {
            this.uninstallPlugin(prevProps);
            this.installPlugin();
        }
        else if (nonHtmlPropsHaveChanged(this.props, prevProps)) {
            const { uppy, ...options } = { ...this.props, target: this.container };
            this.plugin.setOptions(options);
        }
    }
    componentWillUnmount() {
        this.uninstallPlugin();
    }
    installPlugin() {
        const { uppy, locale, inputName, width, height, note, id } = this.props;
        const options = {
            id: id || 'DragDrop',
            locale,
            inputName,
            width,
            height,
            note,
            target: this.container,
        };
        uppy.use(DragDropPlugin, options);
        this.plugin = uppy.getPlugin(options.id);
    }
    uninstallPlugin(props = this.props) {
        const { uppy } = props;
        uppy.removePlugin(this.plugin);
    }
    render() {
        return h('div', {
            className: 'uppy-Container',
            ref: (container) => {
                this.container = container;
            },
            ...getHTMLProps(this.props),
        });
    }
}
export default DragDrop;
