import { DEFAULT_SETTINGS } from '../../../src/settings/defaults';

describe('Settings defaults', () => {
  test('viewsButtonAlignment defaults to right', () => {
    expect(DEFAULT_SETTINGS.viewsButtonAlignment).toBe('right');
  });

  test('bases view list placement defaults are set for main/side panes', () => {
    expect(DEFAULT_SETTINGS.basesViewListPlacement).toBe('left');
    expect(DEFAULT_SETTINGS.basesViewListSidePanePlacement).toBe('top');
  });
});

