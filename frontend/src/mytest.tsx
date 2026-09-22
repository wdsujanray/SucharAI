import React, { useState, ChangeEvent, DragEvent } from 'react';

interface FileState {
    file: File | null;
    isDragging: boolean;
    progress: number;
    status: 'idle' | 'uploading' | 'converting' | 'success' | 'error';
    errorMessage: string;
}

export const DocxToPdfConverter: React.FC = () => {
    const [docState, setDocState] = useState<FileState>({
        file: null,
        isDragging: false,
        progress: 0,
        status: 'idle',
        errorMessage: '',
    });

    const handleDrag = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDocState(prev => ({ ...prev, isDragging: true }));
        } else if (e.type === "dragleave") {
            setDocState(prev => ({ ...prev, isDragging: false }));
        }
    };

    const validateAndSetFile = (selectedFile: File) => {
        const isDocx = selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            selectedFile.name.endsWith('.docx');

        if (!isDocx) {
            setDocState(prev => ({
                ...prev,
                file: null,
                status: 'error',
                errorMessage: 'Invalid file type. Please upload a .docx file.'
            }));
            return;
        }

        setDocState(prev => ({
            ...prev,
            file: selectedFile,
            status: 'idle',
            errorMessage: '',
        }));
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDocState(prev => ({ ...prev, isDragging: false }));

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndSetFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            validateAndSetFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!docState.file) return;

        setDocState(prev => ({ ...prev, status: 'uploading', progress: 0 }));

        // Simulate upload and conversion process
        const interval = setInterval(() => {
            setDocState(prev => {
                if (prev.progress >= 100) {
                    clearInterval(interval);
                    setTimeout(() => setDocState(p => ({ ...p, status: 'converting', progress: 0 })), 500);
                    return prev;
                }
                return { ...prev, progress: prev.progress + 20 };
            });
        }, 200);

        // *Note: In your actual codebase, you would make an API call here 
        // to your backend endpoint (e.g., /api/convert) sending the FormData.
        /*
        const formData = new FormData();
        formData.append('file', docState.file);
        try {
           const response = await fetch('/api/convert', { method: 'POST', body: formData });
           // Handle PDF download 
        } catch (error) { ... }
        */
    };

    const resetConverter = () => {
        setDocState({
            file: null,
            isDragging: false,
            progress: 0,
            status: 'idle',
            errorMessage: '',
        });
    };

    return (
        <div style={{ maxWidth: '600px', margin: '40px auto', fontFamily: 'sans-serif' }}>
            <div style={{ padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: '12px', background: '#fff' }}>
                <h2 style={{ textAlign: 'center', color: '#1a202c', marginBottom: '8px' }}>DOCX to PDF Converter</h2>
                <p style={{ textAlign: 'center', color: '#718096', marginBottom: '24px' }}>Convert your Word documents to secure PDFs with perfect layout retention.</p>

                {docState.status === 'idle' && (
                    <>
                        <div
                            onDragEnter={handleDrag}
                            onDragOver={handleDrag}
                            onDragLeave={handleDrag}
                            onDrop={handleDrop}
                            style={{
                                border: docState.isDragging ? '2px dashed #4299e1' : '2px dashed #e2e8f0',
                                borderRadius: '8px',
                                padding: '40px 20px',
                                textAlign: 'center',
                                background: docState.isDragging ? '#ebf8ff' : '#f7fafc',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                            onClick={() => document.getElementById('fileInput')?.click()}
                        >
                            <input
                                id="fileInput"
                                type="file"
                                accept=".docx"
                                style={{ display: 'none' }}
                                onChange={handleChange}
                            />
                            <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#a0aec0" strokeWidth="2" style={{ marginBottom: '16px' }}>
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                            </svg>
                            <p style={{ margin: '0 0 8px', color: '#4a5568', fontWeight: '500' }}>
                                Drag and drop your .docx file here
                            </p>
                            <p style={{ margin: '0', color: '#a0aec0', fontSize: '14px' }}>
                                or click to browse
                            </p>
                        </div>

                        {docState.file && (
                            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#edf2f7', padding: '12px 16px', borderRadius: '6px' }}>
                                <span style={{ color: '#2d3748', fontSize: '14px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                    {docState.file.name}
                                </span>
                                <button
                                    onClick={handleUpload}
                                    style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}
                                >
                                    Convert to PDF
                                </button>
                            </div>
                        )}
                    </>
                )}

                {(docState.status === 'uploading' || docState.status === 'converting') && (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <div style={{ border: '4px solid #e2e8f0', borderTop: '4px solid #3182ce', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                        <p style={{ color: '#4a5568', fontWeight: '500' }}>
                            {docState.status === 'uploading' ? 'Uploading Document...' : 'Converting to PDF...'}
                        </p>
                        <div style={{ width: '100%', background: '#e2e8f0', borderRadius: '4px', height: '8px', marginTop: '16px', overflow: 'hidden' }}>
                            <div style={{ width: `${docState.progress}%`, background: '#3182ce', height: '100%', transition: 'width 0.2s' }} />
                        </div>
                        <p style={{ fontSize: '14px', color: '#a0aec0', marginTop: '8px' }}>{docState.progress}%</p>
                    </div>
                )}

                {docState.status === 'success' && (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#48bb78" strokeWidth="2" style={{ marginBottom: '16px' }}>
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                            <path d="M22 4L12 14.01l-3-3" />
                        </svg>
                        <h3 style={{ color: '#2f855a', margin: '0 0 8px' }}>Conversion Successful!</h3>
                        <p style={{ color: '#4a5568', marginBottom: '24px' }}>Your PDF file is ready to be downloaded.</p>
                        <button
                            onClick={() => {/* Trigger Download logic here */ }}
                            style={{ background: '#48bb78', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '6px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            Download PDF
                        </button>
                        <br />
                        <button
                            onClick={resetConverter}
                            style={{ background: 'transparent', color: '#718096', border: 'none', marginTop: '16px', cursor: 'pointer', fontSize: '14px' }}
                        >
                            Convert another file
                        </button>
                    </div>
                )}

                {docState.status === 'error' && (
                    <div style={{ background: '#fed7d7', color: '#c53030', padding: '16px', borderRadius: '6px', textAlign: 'center' }}>
                        <p style={{ margin: '0', fontWeight: '500' }}>{docState.errorMessage}</p>
                        <button
                            onClick={resetConverter}
                            style={{ marginTop: '12px', background: '#c53030', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </div>

            {/* Spinner Animation */}
            <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};
