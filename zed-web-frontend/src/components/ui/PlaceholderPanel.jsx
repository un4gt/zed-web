
import Icon from '../icons/Icon';

function PlaceholderPanel({ body, eyebrow, icon, title }) {
  return (
    <section className="placeholder-panel" aria-label={title}>
      <div className="placeholder-panel-mark">
        <Icon name={icon} />
      </div>
      <div>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </section>
  );
}

export default PlaceholderPanel;
