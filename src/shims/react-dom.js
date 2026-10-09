/**
 * Shim for react-dom in native Expo/React Native environments.
 * Prevents bundling failures when shared cross-platform packages
 * include web portal primitives.
 */
module.exports = {
  createPortal: (children) => children,
  findDOMNode: () => null,
  render: () => null,
  hydrate: () => null,
  unmountComponentAtNode: () => false,
};
