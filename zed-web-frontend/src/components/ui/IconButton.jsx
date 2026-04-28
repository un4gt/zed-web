
import Icon from '../icons/Icon';

function IconButton({ disabled = false, icon, label, onClick, variant = 'ghost' }) {
  return (
    <button
      aria-label={label}
      className={`icon-button icon-button-${variant}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon name={icon} />
    </button>
  );
}

export default IconButton;
