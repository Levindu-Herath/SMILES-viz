export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  file_name: string;
  file_size: number;
  file_type: string;
  uploaded_by_email: string;
  created_at: string;
}

export interface DatasetListResponse {
  datasets: Dataset[];
}

export interface DownloadUrlResponse {
  url: string;
  expires_in: number;
}

export interface UploadResponse {
  dataset: Dataset;
  message: string;
}
