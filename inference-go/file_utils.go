package inference

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// FileUtils provides file operation utilities
type FileUtils struct{}

// NewFileUtils creates a new FileUtils instance
func NewFileUtils() *FileUtils {
	return &FileUtils{}
}

// CalculateMD5 calculates MD5 hash of a file
func (fu *FileUtils) CalculateMD5(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	hasher := md5.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return "", fmt.Errorf("failed to calculate hash: %w", err)
	}

	return hex.EncodeToString(hasher.Sum(nil)), nil
}

// CalculateMD5FromBytes calculates MD5 hash from byte slice
func (fu *FileUtils) CalculateMD5FromBytes(data []byte) string {
	hasher := md5.New()
	hasher.Write(data)
	return hex.EncodeToString(hasher.Sum(nil))
}

// CopyFile copies a file from src to dst
func (fu *FileUtils) CopyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("failed to open source file: %w", err)
	}
	defer sourceFile.Close()

	// Create destination directory if it doesn't exist
	dstDir := filepath.Dir(dst)
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		return fmt.Errorf("failed to create destination directory: %w", err)
	}

	destFile, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer destFile.Close()

	if _, err := io.Copy(destFile, sourceFile); err != nil {
		return fmt.Errorf("failed to copy file: %w", err)
	}

	return nil
}

// EnsureDir ensures a directory exists
func (fu *FileUtils) EnsureDir(dirPath string) error {
	return os.MkdirAll(dirPath, 0755)
}

// FileExists checks if a file exists
func (fu *FileUtils) FileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// GetTrackName extracts track name from file path
func (fu *FileUtils) GetTrackName(path string) string {
	if path == "" {
		return ""
	}
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	return strings.TrimSuffix(base, ext)
}

// GetExtension gets file extension
func (fu *FileUtils) GetExtension(path string) string {
	return filepath.Ext(path)
}

// JoinPath joins path elements
func (fu *FileUtils) JoinPath(elem ...string) string {
	return filepath.Join(elem...)
}

// RemoveFile removes a file
func (fu *FileUtils) RemoveFile(path string) error {
	return os.Remove(path)
}

// GetAbsolutePath returns absolute path
func (fu *FileUtils) GetAbsolutePath(path string) (string, error) {
	return filepath.Abs(path)
}