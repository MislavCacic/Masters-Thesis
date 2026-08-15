import cors from "cors";
import express from "express";
import multer from "multer";

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3001;
const HOST = "127.0.0.1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const documentsDirectory = path.join(__dirname, "document-storage");

if (!fs.existsSync(documentsDirectory)) {
	fs.mkdirSync(documentsDirectory, {
		recursive: true,
	});
}

const allowedMimeTypes = new Set([
	"application/pdf",
	"image/png",
	"image/jpeg",
]);

function getExtension(file) {
	switch (file.mimetype) {
		case "application/pdf":
			return ".pdf";

		case "image/png":
			return ".png";

		case "image/jpeg":
			return ".jpg";

		default:
			return "";
	}
}

const storage = multer.diskStorage({
	destination: (_request, _file, callback) => {
		callback(null, documentsDirectory);
	},

	filename: (_request, file, callback) => {
		const extension = getExtension(file);

		callback(null, `${randomUUID()}${extension}`);
	},
});

const upload = multer({
	storage,
	limits: {
		fileSize: 10 * 1024 * 1024,
	},
	fileFilter: (_request, file, callback) => {
		if (!allowedMimeTypes.has(file.mimetype)) {
			callback(new Error("Dozvoljeni su samo PDF, PNG, JPG i JPEG dokumenti."));

			return;
		}

		callback(null, true);
	},
});

const app = express();

app.use(
	cors({
		origin: [
			"http://localhost:5173",
			"http://127.0.0.1:5173",
			"http://localhost:5174",
			"http://127.0.0.1:5174",
		],
	}),
);

app.get("/health", (_request, response) => {
	response.json({
		status: "ok",
		service: "real-estate-document-storage",
	});
});

app.use(
	"/documents",
	express.static(documentsDirectory, {
		fallthrough: false,
	}),
);

app.post("/upload", upload.single("document"), (request, response) => {
	if (!request.file) {
		response.status(400).json({
			error: "Dokument nije poslan.",
		});

		return;
	}

	const documentURI = `http://${HOST}:${PORT}/documents/${request.file.filename}`;

	response.status(201).json({
		documentURI,
		fileName: request.file.filename,
		originalName: request.file.originalname,
		mimeType: request.file.mimetype,
		size: request.file.size,
	});
});

app.use((error, _request, response, _next) => {
	console.error("Document storage error:", error);

	if (error instanceof multer.MulterError) {
		if (error.code === "LIMIT_FILE_SIZE") {
			response.status(400).json({
				error: "Dokument ne smije biti veći od 10 MB.",
			});

			return;
		}
	}

	response.status(400).json({
		error:
			error instanceof Error ? error.message : "Upload dokumenta nije uspio.",
	});
});

app.listen(PORT, HOST, () => {
	console.log("");
	console.log("==============================================");
	console.log("  DOCUMENT STORAGE SERVER");
	console.log("==============================================");
	console.log(`Server: http://${HOST}:${PORT}`);
	console.log(`Health: http://${HOST}:${PORT}/health`);
	console.log(`Dokumenti: http://${HOST}:${PORT}/documents/...`);
	console.log(`Direktorij: ${documentsDirectory}`);
	console.log("==============================================");
	console.log("");
});
