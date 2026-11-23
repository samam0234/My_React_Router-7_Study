export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-red-600">
      {messages[0]}
    </p>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
      {message}
    </p>
  );
}
