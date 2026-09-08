import { Link } from "react-router-dom";
import { Button, Container, EmptyState, usePageMeta } from "cordon-ui";

/**
 * The console's own 404. The public surfaces have their own, on the site —
 * an address that is wrong here is wrong for an owner, not for a reader.
 */
export default function NotFound() {
  usePageMeta({
    title: "Not found · Cordon",
    description: "No page at this address.",
  });

  return (
    <div className="shell">
      <Container width="content">
        {/* EmptyState sets its title as a paragraph, which left this page with
            no heading at all — a document whose outline is empty. The heading
            is here; the visible title stays with the component. */}
        <h1 className="visually-hidden">No page here</h1>
        <EmptyState
          icon="search"
          title="No page here"
          description="The link is wrong, or the surface has not been built yet. Both happen."
          ornament
          action={
            <Link to="/console">
              <Button variant="primary" magnetic>
                Open the console
              </Button>
            </Link>
          }
        />
      </Container>
    </div>
  );
}
