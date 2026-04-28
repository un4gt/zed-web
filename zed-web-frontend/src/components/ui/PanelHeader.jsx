
import Icon from '../icons/Icon';
import IconButton from './IconButton';

function PanelHeader({ icon, onClose, title }) {
  return (
    <div className="panel-title-row">
      <div className="panel-title-main">
        <Icon name={icon} />
        <h2>{title}</h2>
      </div>
      <IconButton icon="close" label={`Close ${title}`} onClick={onClose} variant="ghost" />
    </div>
  );
}

export default PanelHeader;
