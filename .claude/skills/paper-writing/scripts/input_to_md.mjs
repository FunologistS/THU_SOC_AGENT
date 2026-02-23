import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse'; // PDF处理库
import mammoth from 'mammoth'; // Word处理库

// 根据文件类型处理，转换为Markdown格式
function convertToMarkdown(filePath, outputPath) {
  // 获取文件扩展名
  const ext = path.extname(filePath).toLowerCase();

  // 检查文件扩展名是否有效
  if (ext !== '.pdf' && ext !== '.docx') {
    console.error('不支持的文件类型，支持PDF和Word（.docx）格式');
    return;
  }

  // 根据文件类型选择处理方式
  if (ext === '.pdf') {
    // 处理PDF文件
    processPDF(filePath, outputPath);
  } else if (ext === '.docx') {
    // 处理Word文件
    processWord(filePath, outputPath);
  }
}

// 处理PDF文件
function processPDF(filePath, outputPath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error('读取PDF文件失败:', err);
      return;
    }

    pdfParse(data).then((pdfData) => {
      // 将PDF文本转换为Markdown格式
      const markdownContent = pdfData.text.replace(/\n/g, '\n\n');
      // 保存Markdown文件
      fs.writeFileSync(outputPath, markdownContent);
      console.log('PDF文件转换为Markdown成功:', outputPath);
    }).catch((err) => {
      console.error('PDF解析失败:', err);
    });
  });
}

// 处理Word文件
function processWord(filePath, outputPath) {
  mammoth.extractRawText({ path: filePath })
    .then((result) => {
      // 将Word内容转换为Markdown格式
      const markdownContent = result.value.replace(/\n/g, '\n\n');
      // 保存Markdown文件
      fs.writeFileSync(outputPath, markdownContent);
      console.log('Word文件转换为Markdown成功:', outputPath);
    })
    .catch((err) => {
      console.error('Word文件转换失败:', err);
    });
}

// 获取命令行参数（文件路径）
const filePath = process.argv[2];  // 输入文件路径
const outputPath = process.argv[3]; // 输出文件路径

// 检查输入参数是否有效
if (!filePath || !outputPath) {
  console.error('请提供输入文件路径和输出文件路径作为命令行参数');
  process.exit(1);
}

// 获取当前脚本目录的绝对路径
const baseDir = path.dirname(process.argv[1]);

// 将输入路径调整为相对路径，指向`paper-writing/assets/`
const fullInputPath = path.resolve(baseDir, 'assets', filePath);
const fullOutputPath = path.resolve(baseDir, 'output', outputPath);

// 执行转换
convertToMarkdown(fullInputPath, fullOutputPath);