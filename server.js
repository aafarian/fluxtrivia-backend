require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // Import the UUID generator
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3001;
const triviaFilePath = path.join(__dirname, '../trivia-app/src/triviaData.json');

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const tempQuestionsFilePath = path.join(__dirname, 'tempQuestions.txt');

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function parseTextToQuestionObject(textBlock) {
  const lines = textBlock.trim().split('\n').map(line => line.trim());
  let answers = [];
  let categoryName = capitalizeFirstLetter(lines[0]);
  let advancedCategoryName = capitalizeFirstLetter(lines[1]);
  let questionText = lines[2];
  let explanation = lines[lines.length - 3]; // Assuming the third-last line is always the explanation

  // Remove any leading "and" from the difficulty line and capitalize the first letter
  let difficulty = capitalizeFirstLetter(lines[lines.length - 1].replace(/^and\s+/i, ''));

  // Process answers from A) to D)
  for (let i = 3; i <= lines.length - 4; i++) { // Adjust loop to exclude the explanation, correct answer, and difficulty lines
    if (/^[A-D]\)/.test(lines[i])) {
      const answerId = `a${lines[i][0].toLowerCase()}`; // Assuming 'a' + lowercase letter as ID
      const text = lines[i].slice(3).trim();
      answers.push({ answerId, text });
    }
  }

  // Extract the correct answer letter from the format "C) Nitrogen"
  const correctAnswerMatch = lines[lines.length - 2].match(/^([A-D])\)/);
  let correctAnswerId = '';
  if (correctAnswerMatch) {
    const correctAnswerLetter = correctAnswerMatch[1].toLowerCase();
    correctAnswerId = `a${correctAnswerLetter}`;
  }

  let questionObj = {
    categoryName,
    advancedCategoryName,
    questions: [{
      question: questionText,
      questionId: uuidv4(),
      answers: answers,
      correctAnswerId: correctAnswerId,
      explanation: explanation,
      difficulty: difficulty,
      categoryName: categoryName, // Include categoryName within the question
      advancedCategoryName: advancedCategoryName, // Include advancedCategoryName within the question
    }]
  };

  return questionObj;
}



function processTextFileAndSaveQuestions() {
  const fileContent = fs.readFileSync(tempQuestionsFilePath, 'utf8');
  const questionBlocks = fileContent.split('\n\n').filter(Boolean); // Split by double newline

  questionBlocks.forEach(block => {
    const questionObject = parseTextToQuestionObject(block);
    manipulateAndSaveQuestion(questionObject);
  });
}

const manipulateAndSaveQuestion = (questionObject) => {
  console.log('1111 RUNNING MANIPULATE: \n\n', questionObject);
  // Read the existing trivia data or initialize if not present
  let triviaData;
  try {
    const data = fs.readFileSync(triviaFilePath, 'utf8');
    triviaData = JSON.parse(data);
  } catch (error) {
    triviaData = { categories: [] };
  }

  // Find the index of the category or -1 if not found
  const categoryIndex = triviaData.categories.findIndex(cat => cat.categoryName === questionObject.categoryName);

  if (categoryIndex === -1) {
    // New category: add with a new UUID
    const createdUUID = uuidv4();
    const newCategory = {
      categoryId: createdUUID,
      categoryName: questionObject.categoryName,
      advancedCategoryName: questionObject.advancedCategoryName,
      questions: questionObject.questions.map((question) => ({ ...question, categoryId: createdUUID })),
    };
    triviaData.categories.push(newCategory);
  } else {
    // Existing category: add new questions if not duplicates
    const currentCategory = triviaData.categories[categoryIndex];
    questionObject.questions.forEach(question => {
      const duplicate = currentCategory.questions.find(q => q.question === question.question);
      if (!duplicate) {
        currentCategory.questions.push({
          categoryId: currentCategory.categoryId,
          ...question,
        });
      }
    });
  }

  // Write the updated data back to the trivia data file
  fs.writeFileSync(triviaFilePath, JSON.stringify(triviaData, null, 2), 'utf8');
  console.log("Question(s) successfully saved to trivia data.");
}

// POST route for generating and processing multiple questions
app.post('/generate-questions', async (req, res) => {
  const { category, numberOfQuestions } = req.body;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [{
        "role": "user",
        "content": `
          Generate ${numberOfQuestions} easy to very challenging trivia question of category ${category} or related to ${category} including four multiple-choice answers (A, B, C, and D).
          Don't allow vulgar categories and if there's a category that's too long, condense it to create a category similar to it.
          List each question with no numbers or anything, no bolding or asterisks, and format the output as follows:
          category (high level, most basic category) \n advanced category (for analytics) \n question text \n answer options in a list separated by \n explanation \n <letter of correct answer>) the correct answer \n difficulty \n.
          Separated by \n\n
        `
      }],
      temperature: 1,
      max_tokens: 4000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    // Assuming the response contains questions separated by two newlines
    let content = response.choices[0].message.content;
    console.log('Content received: \n\n', content);

    // Save to tempQuestions.txt
    fs.writeFileSync(tempQuestionsFilePath, content, 'utf8');

    processTextFileAndSaveQuestions();

    // res.send({ message: `${questions.length} questions processed and saved.` });
  } catch (error) {
    console.log('Failed to generate or process questions:', error);
    res.status(500).send({ error: "Failed to generate or process questions" });
  }
});

async function generateTriviaQuestion(category) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [{
        "role": "user",
        "content": `
          Generate a challenging trivia question of category ${category} or related to it if there are none, including four multiple-choice answers (A, B, C, and D).
          Don't allow vulgar categories and if there's a category that's too long, condense it to create a category similar to it.
          Format the output as follows: category, question text, answer options in a list, and indicate the correct answer. Follow this structure,
          and please make sure the string doesn't start with backticks:

          {
            "categoryName": "general category name for the UI to show (high level)",
            "advancedCategoryName": "more specific category name",
            "questions": [{
              "questionId": "make sure it is a uuid",
              "question": "the trivia question",
              "answers": [
                {"answerId": "a1", "text": "First option"},
                {"answerId": "a2", "text": "Second option"},
                {"answerId": "a3", "text": "Third option"},
                {"answerId": "a4", "text": "Fourth option"}
              ],
              "correctAnswerId": "ID of the correct answer",
              "difficulty": "difficulty of question",
              "explanation": "explanation"
            }]
          }
        `
      }],
      temperature: 1,
      max_tokens: 4000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    let content = response.choices[0].message.content;
    console.log('Content response of generated question: ', content);

    // Check and remove starting and ending backticks if present
    if (content.startsWith("```json") && content.endsWith("```")) {
      content = content.substring(7, content.length - 3); // Remove the initial ```json\n and the trailing \n```
    }

    const parsedContent = JSON.parse(content.trim());
    parsedContent.questions = parsedContent.questions.map(question => ({
      ...question,
      categoryName: parsedContent.categoryName,
      advancedCategoryName: parsedContent.advancedCategoryName,
      generatedBy: 'thecalminsanity', // replace with username later
    }));

    console.log('Parsed response: ', parsedContent);
    return parsedContent;

  } catch (e) {
    console.error(`Error generating question for category '${category}':`, e);
    return { error: "Failed to generate a question" };
  }
}

app.get('/get-question', async (req, res) => {
  const { category } = req.query;
  if (!category) {
    return res.status(400).send("Category is required");
  }

  const questionObject = await generateTriviaQuestion(category);
  if (questionObject.error) {
    return res.status(500).send(questionObject.error);
  }

  res.json(questionObject);
  try {
    manipulateAndSaveQuestion(questionObject);
  } catch (error) {
    console.error("Error saving the question:", error);
    res.status(500).send("Error saving the question");
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
