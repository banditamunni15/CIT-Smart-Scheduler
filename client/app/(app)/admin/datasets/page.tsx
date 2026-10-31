"use client";

import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, FileJson2, Upload } from "lucide-react";
import { ApiClientError, get, post } from "@/lib/api";
import { asRecord, formatDate, prettyJson } from "@/lib/admin-data";
import { RequireRole } from "@/components/require-role";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PaginationBar } from "@/components/pagination-bar";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/table-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Dataset = {
  id: string;
  datasetKey: string;
  label: string;
  version: number;
  source: string;
  summary: unknown;
  isActive?: boolean;
  createdAt: string;
};

type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

type ActiveDataset = {
  id: string;
  datasetKey: string;
  label: string;
  version: number;
  summary: unknown;
};

function DatasetPageContent() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [label, setLabel] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsedData, setParsedData] = useState<Record<string, unknown> | null>(
    null,
  );
  const [fileError, setFileError] = useState("");

  const active = useQuery({
    queryKey: ["admin", "datasets", "active"],
    queryFn: () => get<ActiveDataset>("/api/datasets/active"),
    retry: false,
  });
  const history = useQuery({
    queryKey: ["admin", "datasets", page],
    queryFn: () => get<PageData<Dataset>>(`/api/datasets?page=${page}&limit=10`),
  });
  const upload = useMutation({
    mutationFn: () => {
      if (!parsedData || !label.trim()) {
        throw new Error("Choose a valid dataset file and enter a label.");
      }
      return post<Dataset>("/api/datasets/upload", {
        label: label.trim(),
        data: parsedData,
      });
    },
    onSuccess: async () => {
      setLabel("");
      setFileName("");
      setParsedData(null);
      setFileError("");
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["admin", "datasets"] });
    },
  });
  const activate = useMutation({
    mutationFn: (id: string) => post(`/api/datasets/${encodeURIComponent(id)}/activate`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "datasets"] }),
  });

  const selectFile = async (file: File | undefined) => {
    setFileError("");
    setParsedData(null);
    setFileName("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setFileError("Choose a JSON file.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error("The dataset JSON must be an object.");
      }
      setParsedData(parsed as Record<string, unknown>);
      setFileName(file.name);
    } catch (error) {
      setFileError(
        error instanceof SyntaxError
          ? "The selected file is not valid JSON."
          : error instanceof Error
            ? error.message
            : "Unable to read the selected file.",
      );
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void selectFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void selectFile(event.dataTransfer.files[0]);
  };

  const previewCounts = parsedData
    ? Object.fromEntries(
        Object.entries(parsedData)
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => [key, (value as unknown[]).length]),
      )
    : null;
  const activeSummary = asRecord(active.data?.summary);
  const activeCounts = asRecord(activeSummary.counts);
  const validationError =
    upload.error instanceof ApiClientError &&
    upload.error.code === "SCHEDULE_RULE_VIOLATION"
      ? upload.error
      : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Datasets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the active scheduling dataset and dataset history.
        </p>
      </header>

      <Card className="border border-border shadow-xs">
        <CardHeader>
          <CardTitle>Active dataset</CardTitle>
          <CardDescription>The dataset currently used by scheduling.</CardDescription>
        </CardHeader>
        <CardContent>
          {active.isPending ? (
            <TableSkeleton rows={2} columns={2} />
          ) : active.isError &&
            active.error instanceof ApiClientError &&
            active.error.code === "NO_ACTIVE_DATASET" ? (
            <EmptyState
              icon={Database}
              title="No active dataset"
              description="Upload or activate a dataset to enable scheduling."
              action={
                <Button variant="outline" onClick={() => inputRef.current?.click()}>
                  Upload dataset
                </Button>
              }
            />
          ) : active.isError ? (
            <ErrorState error={active.error} onRetry={() => void active.refetch()} />
          ) : active.data ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Label</p>
                <p className="mt-1 font-medium">{active.data.label}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Dataset key</p>
                <p className="mt-1 font-medium">{active.data.datasetKey}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Version</p>
                <p className="mt-1 font-medium">{active.data.version}</p>
              </div>
              {Object.entries(activeCounts).map(([key, count]) => (
                <div key={key}>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{key}</p>
                  <p className="mt-1 font-medium">{String(count)}</p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card id="dataset-upload" className="border border-border shadow-xs">
        <CardHeader>
          <CardTitle>Upload dataset</CardTitle>
          <CardDescription>
            Upload a JSON dataset. The file is validated before it is saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-2">
            <label htmlFor="dataset-label" className="text-sm font-medium">Dataset label</label>
            <Input
              id="dataset-label"
              value={label}
              maxLength={200}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Fall 2026"
            />
          </div>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".json,application/json"
            onChange={onFileChange}
          />
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose or drop a dataset JSON file"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-5 py-6 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {fileName ? (
              <>
                <FileJson2 className="mb-2 size-6 text-muted-foreground" />
                <span className="text-sm font-medium">{fileName}</span>
                <span className="mt-1 text-xs text-muted-foreground">Click to choose another file</span>
              </>
            ) : (
              <>
                <Upload className="mb-2 size-6 text-muted-foreground" />
                <span className="text-sm font-medium">Drop a JSON file here</span>
                <span className="mt-1 text-xs text-muted-foreground">or click to browse</span>
              </>
            )}
          </div>
          {fileError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to read dataset</AlertTitle>
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          ) : null}
          {previewCounts ? (
            <div className="rounded-md border bg-card p-3">
              <p className="mb-2 text-sm font-medium">Counts preview</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(previewCounts).map(([key, count]) => (
                  <span key={key} className="rounded-md border px-2 py-1 text-xs">
                    {key}: {count}
                  </span>
                ))}
                {Object.keys(previewCounts).length === 0 ? (
                  <span className="text-sm text-muted-foreground">No array fields found.</span>
                ) : null}
              </div>
            </div>
          ) : null}
          {validationError ? (
            <Alert variant="destructive">
              <AlertTitle>Dataset validation failed</AlertTitle>
              <AlertDescription>
                <p>{validationError.message}</p>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/20 bg-background p-3 text-xs">
                  {prettyJson(validationError.details)}
                </pre>
              </AlertDescription>
            </Alert>
          ) : upload.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Upload failed</AlertTitle>
              <AlertDescription>
                {upload.error instanceof Error ? upload.error.message : "The dataset could not be uploaded."}
              </AlertDescription>
            </Alert>
          ) : null}
          <Button
            onClick={() => upload.mutate()}
            disabled={!parsedData || !label.trim() || upload.isPending}
          >
            {upload.isPending ? "Uploading…" : "Upload dataset"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border border-border shadow-xs">
        <CardHeader>
          <CardTitle>Dataset history</CardTitle>
          <CardDescription>Previously uploaded datasets.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {history.isPending ? (
            <div className="p-4"><TableSkeleton rows={5} columns={5} /></div>
          ) : history.isError ? (
            <div className="p-4">
              <ErrorState error={history.error} onRetry={() => void history.refetch()} />
            </div>
          ) : history.data.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Database}
                description="Uploaded datasets will appear here."
                action={
                  <Button variant="outline" onClick={() => inputRef.current?.click()}>
                    Upload a dataset
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Dataset</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Key / version</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.data.items.map((dataset) => (
                    <TableRow key={dataset.id} className="h-11">
                      <TableCell className="font-medium">{dataset.label}</TableCell>
                      <TableCell>{dataset.datasetKey} · v{dataset.version}</TableCell>
                      <TableCell>{formatDate(dataset.createdAt)}</TableCell>
                      <TableCell>
                        {dataset.isActive ? <StatusBadge status="PUBLISHED" /> : <StatusBadge status="ARCHIVED" />}
                      </TableCell>
                      <TableCell className="text-right">
                        {!dataset.isActive ? (
                          <ConfirmDialog
                            trigger={<Button size="sm" variant="outline">Activate</Button>}
                            title="Activate this dataset?"
                            description={`"${dataset.label}" will become the active scheduling dataset.`}
                            confirmLabel="Activate"
                            onConfirm={() => activate.mutateAsync(dataset.id)}
                          />
                        ) : <span className="text-xs text-muted-foreground">Active</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationBar data={history.data} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DatasetsPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <DatasetPageContent />
    </RequireRole>
  );
}
