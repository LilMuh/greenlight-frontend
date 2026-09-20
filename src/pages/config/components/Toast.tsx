export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className="wa-toast">{message}</div>;
}
