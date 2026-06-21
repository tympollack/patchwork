describe('imageHash module', () => {
  it('should no longer export calculateImageHash', () => {
    const mod = require('../src/utils/imageHash');
    expect(mod.calculateImageHash).toBeUndefined();
  });
});
