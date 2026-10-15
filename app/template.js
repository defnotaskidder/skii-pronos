// Re-mounted on every navigation, so each page plays the entrance animation.
export default function Template({ children }) {
  return <div className="page-enter">{children}</div>;
}
