import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminMaintenancePage from "../AdminMaintenancePage";
import { useAuthStore } from "@/stores/auth-store";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: any) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPage() {
  return render(<AdminMaintenancePage />, { wrapper: createWrapper() });
}

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...(actual as any), useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/use-maintenance", () => ({
  useBackups: vi.fn(),
  useCreateBackup: vi.fn(),
  useDeleteBackup: vi.fn(),
  useRestoreBackup: vi.fn(),
  useMaintenanceMode: vi.fn(),
  useSetMaintenanceMode: vi.fn(),
  downloadBackupFile: vi.fn(),
}));

vi.mock("@/components/ui/LoadingSpinner", () => ({
  default: () => <div>Loading...</div>,
}));
vi.mock("@/components/ui/ErrorMessage", () => ({
  default: ({ onRetry }: any) => (
    <div>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));
vi.mock("@/components/ui/EmptyState", () => ({
  default: () => <div>No backups</div>,
}));
vi.mock("@/components/ui/ConfirmDialog", () => ({
  default: ({ open, onConfirm, onCancel, title }: any) =>
    open ? (
      <div>
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm Delete</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));
vi.mock("@/components/ui/Modal", () => ({
  default: ({ open, title, children }: any) =>
    open ? (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

import {
  useBackups,
  useCreateBackup,
  useDeleteBackup,
  useRestoreBackup,
  useMaintenanceMode,
  useSetMaintenanceMode,
} from "@/hooks/use-maintenance";

describe("AdminMaintenancePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: "1",
        email: "admin@test.com",
        name: "Admin",
        role: "Admin",
        isActive: true,
        avatarUrl: null,
        createdAt: "",
        updatedAt: "",
      },
      accessToken: "token",
      isAuthenticated: true,
    });
    vi.mocked(useMaintenanceMode).mockReturnValue({
      data: { enabled: false, message: null },
      isLoading: false,
    } as any);
    vi.mocked(useSetMaintenanceMode).mockReturnValue({
      mutateAsync: vi.fn(),
    } as any);
    vi.mocked(useBackups).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useCreateBackup).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
    vi.mocked(useDeleteBackup).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
    vi.mocked(useRestoreBackup).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
  });

  it("renders the page heading and sections", () => {
    renderPage();
    expect(screen.getByText("Admin - Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Enable Maintenance")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(useBackups).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    renderPage();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows empty state when no backups", () => {
    renderPage();
    expect(screen.getByText("No backups")).toBeInTheDocument();
  });

  it("toggles maintenance mode", async () => {
    const setMode = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useSetMaintenanceMode).mockReturnValue({
      mutateAsync: setMode,
      isPending: false,
    } as any);

    renderPage();
    fireEvent.click(screen.getByText("Enable Maintenance"));

    await waitFor(() => {
      expect(setMode).toHaveBeenCalledWith({
        enabled: true,
        message:
          "System is currently undergoing maintenance. Please try again later.",
      });
    });
  });

  it("renders backup ID", () => {
    vi.mocked(useBackups).mockReturnValue({
      data: [
        {
          id: "20260706-120000",
          createdAt: "2026-07-06T12:00:00Z",
          files: {
            db: { exists: true, size: 1024 },
            uploads: { exists: true, size: 2048 },
          },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderPage();

    expect(screen.getByText("20260706-120000")).toBeInTheDocument();
  });
});
