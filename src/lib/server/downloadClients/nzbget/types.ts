export interface NzbgetGroup {
	Name: string;
	DestDir: string;
}

export interface NzbgetStatus {
	Version: string;
	DownloadRate: number;
}

export interface NzbgetList {
	/** NZB ID */
	FirstID: number;
	/** NZB ID */
	LastID: number;
	/** NZB Name */
	NZBName: string;
	/** NZB Filename */
	NZBFilename: string;
	/** Category */
	Category: string;
	/** Size in Bytes (Lo part) */
	FileSizeLo: number;
	/** Size in Bytes (Hi part) */
	FileSizeHi: number;
	/** Remaning Size in Bytes (Lo part) */
	RemainingSizeLo: number;
	/** Remaning Size in Bytes (Hi part) */
	RemainingSizeHi: number;
	/** Download Status (QUEUED, PAUSED, DOWNLOADING, SUCCESS, FAILURE, DELETED) */
	Status: string;
	/** Destination Directory */
	DestDir: string;
	/** Download Priority (Start, Pforce, Force, High, Normal, Low, VeryLow) */
	Priority: string;
}

export interface NzbgetHistory {
	/** NZB ID */
	ID: number;
	/** NZB Name */
	Name: string;
	/** NZB Filename */
	NZBFilename: string;
	/** Category */
	Category: string;
	/** Size in Bytes (Lo part) */
	FileSizeLo: number;
	/** Size in Bytes (Hi part) */
	FileSizeHi: number;
	/** Download Status (SUCCESS, FAILURE, DELETED) */
	Status: string;
	/** Destination Directory */
	DestDir: string;
	/** Download Priority (Start, Pforce, Force, High, Normal, Low, VeryLow) */
	Priority: string;
	/** Completed Time (Low part) */
	UnixTimeLo: number;
	/** Completed Time (Hi part) */
	UnixTimeHi: number;
}

export interface NzbgetConfigResponse {
	result: NzbgetConfigItem[];
}

export interface NzbgetConfigItem {
	Name: string;
	Value: string;
}

export interface JsonRpcResponse<T> {
	version: string;
	result: T;
	error: {
		name: string;
		code: number;
		message: string;
	} | null;
}
