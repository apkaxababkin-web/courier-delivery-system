# PDF Waybill Extraction Feature

## Overview

The PDF waybill extraction feature allows users to upload a PDF document (waybill/invoice) and automatically extract key delivery information to auto-fill the task creation form.

## How It Works

### 1. **Frontend (UI)**
- User clicks "Выбрать PDF" button in the task creation form
- Selects a PDF file from their computer
- The file is read as base64 and sent to the backend

### 2. **Backend Processing**
- PDF is uploaded to cloud storage (S3)
- LLM (Gemini 2.5 Flash) analyzes the PDF document
- Extracts structured data in JSON format
- Returns extracted fields to frontend

### 3. **Auto-Fill**
- Frontend receives extracted data
- Automatically populates form fields:
  - Recipient name
  - Recipient phone
  - Delivery address
  - Sender name
  - Sender address
  - Sender phone
  - Package description
  - Tracking number
  - Delivery time window
  - Special instructions

## Technical Implementation

### Backend Endpoint

**Route:** `requests.extractFromPdf`
**Method:** POST (tRPC mutation)
**Access:** Public (no authentication required)

**Input:**
```typescript
{
  pdfBase64: string;      // PDF file encoded as base64
  fileName?: string;      // Original filename (optional)
}
```

**Output:**
```typescript
{
  success: boolean;
  data: {
    recipientName: string;
    recipientPhone: string;
    deliveryAddress: string;
    senderName: string;
    senderAddress: string;
    senderPhone: string;
    packageDescription: string;
    trackingNumber: string;
    deliveryTimeFrom: string;
    deliveryTimeTo: string;
    specialInstructions: string;
  }
}
```

### Frontend Integration

**File:** `src/views/TasksView.tsx`

**State Management:**
```typescript
const [pdfLoading, setPdfLoading] = useState(false);
const [pdfError, setPdfError] = useState<string | null>(null);
const pdfInputRef = React.useRef<HTMLInputElement>(null);
```

**Handler Function:**
```typescript
const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  // 1. Read file as base64
  // 2. Send to backend
  // 3. Auto-fill form fields
  // 4. Show success/error message
}
```

**UI Component:**
```tsx
<div className="border-t pt-4">
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Загрузить накладную (PDF)
  </label>
  <button onClick={() => pdfInputRef.current?.click()}>
    Выбрать PDF
  </button>
  {pdfError && <div className="text-red-700">{pdfError}</div>}
</div>
```

## Usage

### For End Users

1. Open the task creation form
2. Click "Выбрать PDF" button
3. Select a PDF waybill from your computer
4. Wait for processing (shows "Обработка PDF...")
5. Form fields will be automatically filled
6. Review and adjust fields as needed
7. Submit the form

### For Developers

**API Call Example:**
```typescript
const response = await api.post('/requests/extractFromPdf', {
  pdfBase64: base64String,
  fileName: 'waybill.pdf'
});

if (response.data?.success) {
  const extracted = response.data.data;
  // Use extracted data to populate form
}
```

## Supported PDF Types

The LLM can extract data from:
- Standard waybills
- Invoices
- Shipping documents
- Delivery notes
- Any PDF with delivery/recipient information

## Error Handling

**Possible Errors:**
- `Failed to extract waybill data: [error message]` - PDF processing failed
- `Ошибка загрузки: [error message]` - File upload failed
- `Ошибка обработки: [error message]` - LLM analysis failed

**Troubleshooting:**
1. Ensure PDF file is valid and not corrupted
2. Check that PDF contains readable text (not scanned image)
3. For scanned PDFs, ensure good image quality
4. Try a different PDF if one fails

## Performance

- **Processing time:** 3-10 seconds per PDF
- **File size limit:** Depends on storage service (typically 100MB+)
- **Concurrent requests:** Supported (no rate limiting)

## Data Privacy

- PDFs are uploaded to secure cloud storage
- Files are automatically cleaned up after processing
- No data is stored permanently
- LLM analysis is performed server-side only

## Future Enhancements

- [ ] Support for scanned PDFs (OCR)
- [ ] Batch PDF upload
- [ ] PDF preview before extraction
- [ ] Custom field mapping
- [ ] Extraction confidence scores
- [ ] Manual correction UI

## API Reference

### LLM Configuration

**Model:** Gemini 2.5 Flash
**Prompt:** Optimized for waybill/invoice extraction
**Response Format:** JSON
**Max Tokens:** 32768

### Storage

**Service:** S3-compatible cloud storage
**Path:** `waybills/{timestamp}-{filename}`
**Retention:** Temporary (auto-cleanup after processing)

## Code Structure

```
server/
  routers.ts                    # API endpoint definition
  storage.ts                    # S3 upload helper
  _core/llm.ts                  # LLM invocation

src/views/
  TasksView.tsx                 # UI component
    - handlePdfUpload()         # Main handler
    - pdfInputRef               # File input reference
    - pdfLoading/pdfError       # State management
```

## Testing

### Manual Testing Steps

1. Create a test PDF with delivery information
2. Open task creation form
3. Click "Выбрать PDF"
4. Select test PDF
5. Verify fields are populated correctly
6. Check error handling with invalid PDFs

### Test PDF Content Example

```
WAYBILL #12345
Recipient: John Doe
Phone: +7 (901) 234-5678
Address: ul. Sovetskaya 12, apt 45, Ulan-Ude
Sender: ABC Company
Sender Address: ul. Lenin 5, Ulan-Ude
Sender Phone: +7 (301) 234-5678
Package: Electronics
Delivery Time: 09:00 - 11:00
```

## Troubleshooting

### PDF not being recognized

- Ensure file has `.pdf` extension
- Check that file is not password-protected
- Verify PDF is not corrupted

### Fields not being populated

- Check browser console for errors
- Verify PDF contains readable text
- Try with a different PDF

### Timeout errors

- PDFs with many pages may take longer
- Try with a simpler PDF first
- Check network connection

## Support

For issues or feature requests, contact the development team.
