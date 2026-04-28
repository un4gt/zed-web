import { useCallback, useEffect, useRef, useState } from 'react';

function AppMenuBar({ menus }) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const rootRef = useRef(null);
  const buttonRefs = useRef(new Map());

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpenMenuId(null);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const focusMenuByOffset = useCallback(
    (currentIndex, offset) => {
      const nextIndex = (currentIndex + offset + menus.length) % menus.length;
      const nextMenu = menus[nextIndex];
      buttonRefs.current.get(nextMenu.id)?.focus();
      if (openMenuId) {
        setOpenMenuId(nextMenu.id);
      }
    },
    [menus, openMenuId],
  );

  return (
    <nav className="app-menubar" aria-label="Application menu" ref={rootRef} role="menubar">
      {menus.map((menu, index) => {
        const open = openMenuId === menu.id;

        return (
          <div className="app-menu" key={menu.id}>
            <button
              aria-expanded={open}
              aria-haspopup="menu"
              className={`app-menu-trigger ${open ? 'is-open' : ''}`}
              onClick={() => setOpenMenuId(open ? null : menu.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setOpenMenuId(menu.id);
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  focusMenuByOffset(index, 1);
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  focusMenuByOffset(index, -1);
                }
              }}
              onMouseEnter={() => {
                if (openMenuId) {
                  setOpenMenuId(menu.id);
                }
              }}
              ref={(node) => {
                if (node) {
                  buttonRefs.current.set(menu.id, node);
                } else {
                  buttonRefs.current.delete(menu.id);
                }
              }}
              role="menuitem"
              type="button"
            >
              {menu.label}
            </button>
            {open ? <MenuPanel items={menu.items} label={menu.label} onClose={() => setOpenMenuId(null)} /> : null}
          </div>
        );
      })}
    </nav>
  );
}

function MenuPanel({ items, label, nested = false, onClose }) {
  return (
    <div className={`app-menu-panel ${nested ? 'app-menu-subpanel' : ''}`} aria-label={label} role="menu">
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <div className="app-menu-separator" key={`separator-${index}`} role="separator" />;
        }

        if (item.items) {
          return (
            <div className="app-menu-submenu" key={item.label} role="none">
              <button
                aria-disabled={item.disabled ? 'true' : undefined}
                aria-haspopup="menu"
                className="app-menu-item app-menu-submenu-button"
                disabled={item.disabled}
                onClick={(event) => event.preventDefault()}
                role="menuitem"
                type="button"
              >
                <span>{item.label}</span>
                <span className="app-menu-submenu-arrow">›</span>
              </button>
              <MenuPanel items={item.items} label={item.label} nested onClose={onClose} />
            </div>
          );
        }

        return (
          <button
            aria-disabled={item.disabled ? 'true' : undefined}
            className="app-menu-item"
            disabled={item.disabled}
            key={item.label}
            onClick={() => {
              if (!item.disabled) {
                item.onSelect?.();
                onClose();
              }
            }}
            role="menuitem"
            type="button"
          >
            <span>{item.label}</span>
            {item.shortcut ? <span className="app-menu-shortcut">{item.shortcut}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export default AppMenuBar;
