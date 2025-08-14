import FileInputPlugin, {} from '@uppy/file-input';
import { Component, createElement as h } from 'react';
/**
 * React component that renders an area in which files can be dropped to be
 * uploaded.
 */
class FileInput extends Component {
    // Must be kept in sync with @uppy/file-input/src/FileInput.js
    static defaultProps = {
        locale: undefined,
        pretty: true,
        inputName: 'files[]',
    };
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
    }
    componentWillUnmount() {
        this.uninstallPlugin();
    }
    installPlugin() {
        const { uppy, locale, pretty, inputName, id } = this.props;
        const options = {
            id: id || 'FileInput',
            locale,
            pretty,
            inputName,
            target: this.container,
        };
        uppy.use(FileInputPlugin, options);
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
        });
    }
}
export default FileInput;
