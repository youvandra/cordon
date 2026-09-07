import { Link } from "react-router-dom";
import { Button, EmptyState } from "cordon-ui";

export default function NotFound() {
  return (
    <section className="section">
      <div className="wrap wrap--narrow">
        <EmptyState
          icon="search"
          title="No page here"
          description="The link is wrong, or the page has not been built yet. Both happen."
          action={
            <Link to="/">
              <Button variant="primary">Back to the start</Button>
            </Link>
          }
        />
      </div>
    </section>
  );
}
