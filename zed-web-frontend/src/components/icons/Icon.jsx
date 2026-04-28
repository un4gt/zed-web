function Icon({ name }) {
  const path = iconPath(name);

  return (
    <svg aria-hidden="true" className="icon" focusable="false" viewBox="0 0 24 24">
      {path}
    </svg>
  );
}

function iconPath(name) {
  switch (name) {
    case 'arrow-left':
      return <path d="M15 6l-6 6 6 6" />;
    case 'arrow-right':
      return <path d="M9 6l6 6-6 6" />;
    case 'bolt':
      return <path d="M13 2.8L5.5 13h5L9 21.2 18.5 9h-5z" />;
    case 'branch':
      return (
        <>
          <circle cx="7" cy="6" r="2.2" />
          <circle cx="17" cy="18" r="2.2" />
          <path d="M7 8.2v4.3c0 3 2 5.5 5 5.5h2.8" />
          <path d="M7 12.2h5c2.8 0 5-2.2 5-5V4.8" />
        </>
      );
    case 'bug':
      return (
        <>
          <path d="M8 8.5h8v7.5a4 4 0 0 1-8 0z" />
          <path d="M9 5.5l2 3" />
          <path d="M15 5.5l-2 3" />
          <path d="M4 12h4" />
          <path d="M16 12h4" />
          <path d="M5 18l3-2" />
          <path d="M19 18l-3-2" />
        </>
      );
    case 'check':
      return <path d="M5 12.5l4 4L19 7" />;
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7.5v5l3.3 2" />
        </>
      );
    case 'close':
      return (
        <>
          <path d="M7 7l10 10" />
          <path d="M17 7L7 17" />
        </>
      );
    case 'code':
      return (
        <>
          <path d="M8 8l-4 4 4 4" />
          <path d="M16 8l4 4-4 4" />
          <path d="M14 5l-4 14" />
        </>
      );
    case 'command':
      return (
        <>
          <path d="M8 9h8" />
          <path d="M8 15h8" />
          <path d="M9 8v8" />
          <path d="M15 8v8" />
          <circle cx="7" cy="7" r="2" />
          <circle cx="17" cy="7" r="2" />
          <circle cx="7" cy="17" r="2" />
          <circle cx="17" cy="17" r="2" />
        </>
      );
    case 'file':
      return (
        <>
          <path d="M7 3.5h6.5L18 8v12.5H7z" />
          <path d="M13.5 3.5V8H18" />
        </>
      );
    case 'files':
      return (
        <>
          <path d="M6 4.5h8.5L18 8v11.5H6z" />
          <path d="M9 2.5h6.5L21 8v9" />
          <path d="M9 13h6" />
          <path d="M9 16h4" />
        </>
      );
    case 'filter':
      return (
        <>
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </>
      );
    case 'folder':
      return (
        <>
          <path d="M3.5 7.5h6l2 2h9v9h-17z" />
          <path d="M3.5 7.5v-2h6l2 2" />
        </>
      );
    case 'help':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.5-1.2 1-1.2 2" />
          <path d="M12 17h.01" />
        </>
      );
    case 'list':
      return (
        <>
          <path d="M8 6h12" />
          <path d="M8 12h12" />
          <path d="M8 18h12" />
          <path d="M4 6h.01" />
          <path d="M4 12h.01" />
          <path d="M4 18h.01" />
        </>
      );
    case 'menu':
      return (
        <>
          <path d="M5 7h14" />
          <path d="M5 12h14" />
          <path d="M5 17h14" />
        </>
      );
    case 'panel':
      return (
        <>
          <path d="M4 5h16v14H4z" />
          <path d="M15 5v14" />
          <path d="M8 9h4" />
          <path d="M8 12h4" />
          <path d="M8 15h3" />
        </>
      );
    case 'panel-left':
      return (
        <>
          <path d="M4 5h16v14H4z" />
          <path d="M9 5v14" />
        </>
      );
    case 'plus':
      return (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      );
    case 'refresh':
      return (
        <>
          <path d="M18.5 8.5a7 7 0 0 0-12-2.5L5 7.5" />
          <path d="M5 4.5v3h3" />
          <path d="M5.5 15.5a7 7 0 0 0 12 2.5l1.5-1.5" />
          <path d="M19 19.5v-3h-3" />
        </>
      );
    case 'send':
      return (
        <>
          <path d="M4 12l16-8-5 16-3-6z" />
          <path d="M12 14l-3 4" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v2" />
          <path d="M12 18.5v2" />
          <path d="M5.9 5.9l1.4 1.4" />
          <path d="M16.7 16.7l1.4 1.4" />
          <path d="M3.5 12h2" />
          <path d="M18.5 12h2" />
          <path d="M5.9 18.1l1.4-1.4" />
          <path d="M16.7 7.3l1.4-1.4" />
        </>
      );
    case 'save':
      return (
        <>
          <path d="M5 4h11l3 3v13H5z" />
          <path d="M8 4v6h8V4" />
          <path d="M8 20v-6h8v6" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="M15 15l4.5 4.5" />
        </>
      );
    case 'sparkles':
      return (
        <>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
          <path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z" />
        </>
      );
    case 'terminal':
      return (
        <>
          <path d="M4 5h16v14H4z" />
          <path d="M7 9l3 3-3 3" />
          <path d="M12 15h5" />
        </>
      );
    case 'trash':
      return (
        <>
          <path d="M5 7h14" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M8 7l1-3h6l1 3" />
          <path d="M7 7l1 13h8l1-13" />
        </>
      );
    case 'users':
      return (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M4 19c.7-3 2.5-4.5 5-4.5s4.3 1.5 5 4.5" />
          <path d="M15 11a2.5 2.5 0 1 0 0-5" />
          <path d="M16 14.5c2 .4 3.3 1.9 4 4.5" />
        </>
      );
    case 'warning':
      return (
        <>
          <path d="M12 4l9 16H3z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>
      );
    case 'zed':
      return (
        <>
          <path d="M7 6h10l-10 12h10" />
          <path d="M7 12h10" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="7" />;
  }
}

export default Icon;
