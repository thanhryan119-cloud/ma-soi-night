// Every page fades in when you open it. Only opacity is animated: a transform
// here would break the pages' `position: fixed` layouts while it runs.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
