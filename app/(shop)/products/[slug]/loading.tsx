// A dynamic segment needs its own loading state (Day 11 lesson), so the
// shell is sent at once while the product streams in.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading product" className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="skeleton aspect-[5/4] w-full rounded-card" />
      <div className="space-y-4">
        <div className="skeleton h-12 w-3/4" />
        <div className="skeleton h-64 w-full rounded-card" />
      </div>
    </div>
  )
}
