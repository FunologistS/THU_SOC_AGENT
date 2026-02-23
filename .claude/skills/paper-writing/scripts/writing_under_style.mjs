import openai from 'openai';  // 使用OpenAI API进行文本生成
import fs from 'fs';
import path from 'path';

// 配置OpenAI API密钥
openai.apiKey = process.env.OPENAI_API_KEY;

// 获取命令行输入的风格类型和文件路径
const inputFile = process.argv[2];  // 输入文件路径
const outputFile = process.argv[3]; // 输出文件路径
const style = process.argv[4];      // 风格选择：academic 或 colloquial

// 读取输入文件（已有文稿）
fs.readFile(inputFile, 'utf8', async (err, data) => {
  if (err) {
    console.error(`读取文件出错: ${err}`);
    return;
  }

  let prompt;
  if (style === 'academic') {
    // 学术风格的生成提示
    prompt = `请模仿以下学术文献的风格，生成新的内容：\n\n${data}`;
  } else if (style === 'colloquial') {
    // 通俗风格的生成提示
    prompt = `请模仿以下通俗风格的写作方式，生成新的内容：\n\n${data}`;
  } else {
    console.error('未知的风格类型，请选择 "academic" 或 "colloquial"');
    return;
  }

  try {
    const response = await openai.Completion.create({
      model: 'text-davinci-003',  // 你可以替换成其他OpenAI模型
      prompt: prompt,
      max_tokens: 1500,
      temperature: 0.7,
    });

    // 获取生成的内容
    const generatedContent = response.choices[0].text.trim();

    // 将生成的内容保存到输出文件
    fs.writeFile(outputFile, generatedContent, 'utf8', (err) => {
      if (err) {
        console.error(`写入文件出错: ${err}`);
        return;
      }
      console.log('新文稿已生成并保存');
    });

  } catch (error) {
    console.error(`OpenAI API 出错: ${error}`);
  }
});