
import { useCallback } from 'react';
import { PANEL_LIMITS } from '../constants/panels';
import { clamp } from '../lib/math';

function usePanelResize(panelLayoutRef, setPanelLayout) {
  return useCallback(
    (panel, event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLayout = panelLayoutRef.current;
      const limits = PANEL_LIMITS[panel];

      function handlePointerMove(moveEvent) {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        setPanelLayout((currentLayout) => {
          if (panel === 'project') {
            return {
              ...currentLayout,
              projectWidth: clamp(startLayout.projectWidth + deltaX, limits.min, limits.max),
            };
          }

          if (panel === 'inspector') {
            return {
              ...currentLayout,
              inspectorWidth: clamp(startLayout.inspectorWidth - deltaX, limits.min, limits.max),
            };
          }

          return {
            ...currentLayout,
            terminalHeight: clamp(startLayout.terminalHeight - deltaY, limits.min, limits.max),
          };
        });
      }

      function stopPanelResize() {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', stopPanelResize);
        window.removeEventListener('pointercancel', stopPanelResize);
        document.body.classList.remove('is-resizing', `is-resizing-${panel}`);
      }

      document.body.classList.add('is-resizing', `is-resizing-${panel}`);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopPanelResize, { once: true });
      window.addEventListener('pointercancel', stopPanelResize, { once: true });
    },
    [panelLayoutRef, setPanelLayout],
  );
}

export default usePanelResize;
