import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import LoginPage from "@/pages/LoginPage";
import TicketsPage from "@/pages/TicketsPage";
import Pagination from "@/components/ui/Pagination";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import ErrorMessage from "@/components/ui/ErrorMessage";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

expect.extend(toHaveNoViolations);

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe("Accessibility (a11y)", () => {
  it("LoginPage has no violations", async () => {
    const { container } = render(<LoginPage />, { wrapper: TestWrapper });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("TicketsPage has no violations", async () => {
    const { container } = render(<TicketsPage />, { wrapper: TestWrapper });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("Pagination has no violations", async () => {
    const { container } = render(
      <Pagination
        page={1}
        totalPages={5}
        onPageChange={() => {}}
        limit={10}
        onLimitChange={() => {}}
        totalItems={50}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("LoadingSpinner has no violations", async () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("EmptyState has no violations", async () => {
    const { container } = render(
      <EmptyState title="No items" description="Nothing to show" />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("ErrorMessage has no violations", async () => {
    const { container } = render(
      <ErrorMessage message="Something went wrong" />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("ConfirmDialog has no violations", async () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Delete?"
        message="Are you sure?"
        confirmLabel="Delete"
        variant="danger"
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
