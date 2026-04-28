function StatusBadge({ state }) {
  return <span className={`status-badge status-${state}`}>{state}</span>;
}

export default StatusBadge;
