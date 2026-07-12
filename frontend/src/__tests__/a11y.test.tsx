import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import LoginPage from "@/pages/LoginPage";
import TicketsPage from "@/pages/TicketsPage";
import Pagination from "@/components/ui/Pagination";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import ErrorMessage from "@/components/ui/ErrorMessage";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import TicketSolutionSuggestions from "@/components/tickets/TicketSolutionSuggestions";

vi.mock("@/hooks/use-faqs", async () => {
  const actual = await vi.importActual("@/hooks/use-faqs");
  return {
    ...actual,
    useFaqRecommendations: (() => ({
      data: [
        {
          id: "faq-1",
          question: "How to reset your Wi-Fi adapter",
          answer: "Go to Settings > Network > Adapter and restart it.",
          displayOrder: 0,
          categoryId: null,
        },
      ],
      isLoading: false,
      isError: false,
    })) as any,
    useRecordFaqInteraction: (() => ({
      mutateAsync: vi.fn().mockResolvedValue({ recorded: true }),
    })) as any,
  };
});

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

  it("TicketSolutionSuggestions has no violations", async () => {
    const { container } = render(
      <TicketSolutionSuggestions
        sessionId="c8fc98e1-0cab-4f60-8904-600adbf348c2"
        subCategoryId="73955f5b-d64c-4fc7-b497-378e688bb25a"
        subject="wifi adapter issue"
      />,
      { wrapper: TestWrapper },
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
