export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className="tt-toast">{message}</div>;
}
