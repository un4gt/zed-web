
import Icon from '../icons/Icon';

function IconButton({ active = false, disabled = false, icon, label, onClick, variant = 'ghost' }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`icon-button icon-button-${variant} ${active ? 'is-active' : ''}`}
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
