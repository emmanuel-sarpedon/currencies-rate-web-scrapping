// ! ----- DEPENDENCIES -----
require("dotenv").config();
const cors = require("cors");
const puppeteer = require("puppeteer");
const express = require("express");
const formidable = require("express-formidable");
const mongoose = require("mongoose");

// ! ----- APP -----
const app = express();
app.use(formidable());
app.use(cors());

// ! ----- BDD -----
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
});

// ! ----- MODELS -----
const Currency = require("./models/Currency");

// ! ----- HELPERS -----
const getRateFromUrl = async (url) => {
  // Lancement du navigateur
  const browser = await puppeteer.launch({
    headless: true,
    // * args: pour déploiement sur Heroku
    // args: [
    //   "--incognito",
    //   "--no-sandbox",
    //   "--single-process",
    //   "--no-zygote",
    // ],
  });
  const page = await browser.newPage();
  await page.goto(url);

  // Gestion de la fenêtre pop-up : accepter les cookies
  await page.waitForSelector("#didomi-notice-agree-button");
  await page.click("#didomi-notice-agree-button");

  // Saisie utilisateur
  await page.focus("#amount");
  await page.keyboard.type("1");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500); // on attend que le navigateur affiche le résultat avant de scrapper le taux (sinon renvoie null)

  const rate = await page.evaluate(() => {
    return Number(
      document.querySelector(".c-currency-converter__convert-rate b").innerHTML
    );
  });

  await page.close();
  await browser.close();

  return rate; // on renvoie le taux affiché sur le site
};

let isUpdating = false;
let messageToUser = "Calcul en cours ...";

// !----- ROUTES -----
app.get("/update", (req, res) => {
  if (!isUpdating) {
    isUpdating = true;
    try {
      (async () => {
        // Lancement du navigateur

        console.log("--> Initialisation de Puppeteer");
        const browser = await puppeteer.launch({
          headless: true,
          // * args: pour déploiement sur Heroku
          // args: [
          //   "--incognito",
          //   "--no-sandbox",
          //   "--single-process",
          //   "--no-zygote",
          // ],
        });
        const page = await browser.newPage();
        await page.goto(process.env.SOURCE_URL);

        console.log("--> Récupération des url");
        // Récupération de toutes les conversions possibles ainsi que les url
        const listOfCurrencies = await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll("td a"));

          const list = el
            .filter((el) => el.innerHTML.slice(3, 6) === "EUR")
            .map((el, i) => ({
              id: i,
              from: {
                currency: el.innerHTML.slice(3, 6),
                description: el.innerHTML.slice(12, 16),
              },
              to: {
                currency: el.innerHTML.slice(31, 34),
                description: el.innerHTML.slice(40, el.innerHTML.length - 1),
              },
              link: el.href,
            }));

          return list;
        });

        console.log(`--> ${listOfCurrencies.length} devises trouvées !`);

        await page.close();
        await browser.close();

        return listOfCurrencies;
      })() // Attente de la résolution de la promesse browser.close()
        .then(async (listOfCurrencies) => {
          console.log("--> Début de la mise à jour des taux");

          // Mise à jour du taux pour chaque devise présente dans l'array 'listOfCurrencies'
          for (let i = 0; i < listOfCurrencies.length; i++) {
            try {
              listOfCurrencies[i].rate = await getRateFromUrl(
                listOfCurrencies[i].link
              );

              if (listOfCurrencies[i].rate) {
                // si on ne parvient pas à récupérer le taux on ne modifie pas la BDD

                try {
                  const currencyToUpdate = await Currency.findOne({
                    link: listOfCurrencies[i].link,
                  });

                  if (currencyToUpdate) {
                    // si la devise existe dans la BDD, on la met à jour et on n'en crée pas une nouvelle
                    currencyToUpdate.rate = newCurrency.rate;
                    currencyToUpdate.updated = Date();

                    await currencyToUpdate.save();
                  } else {
                    const newCurrency = new Currency(listOfCurrencies[i]);

                    newCurrency.created = Date();
                    newCurrency.updated = Date();

                    await newCurrency.save();
                  }
                } catch (error) {
                  console.log(error.message);
                }
              }

              // Affichage de l'avancement de la mise à jour dans la console
              messageToUser = `${i + 1} / ${listOfCurrencies.length} (${(
                ((i + 1) / listOfCurrencies.length) *
                100
              ).toFixed(2)}%) : ${listOfCurrencies[i].from.currency} -> ${
                listOfCurrencies[i].to.currency
              } (${listOfCurrencies[i].to.description})`;

              console.log(messageToUser); // ex : 3 / 158 (1.90%) : EUR -> ALL (lek)
            } catch (error) {
              messageToUser = `Impossible de mettre à jour la devise : ${listOfCurrencies[i].to.currency} \n ${error.message}`;
              console.log(messageToUser);
            }

            if (i === listOfCurrencies.length - 1) {
              isUpdating = false; // on passe la variable isUpdating à false lorsque toute la màj est terminée
              messageToUser = "Calcul en cours ...";
              listOfCurrencies.length = 0; // vide l'array
              console.log("Mise à jour terminée ✅");
            }
          }
        });
      res.status(200).json({
        message:
          "Update started. You can follow the progress by reloading page",
      });
    } catch (error) {
      isUpdating = false;
      res.status(400).json({ error: error.message });
    }
  } else {
    res
      .status(200)
      .json({ message: "Already in progress", progress: messageToUser });
  }
});

app.get("/rates", async (req, res) => {
  const rates = await Currency.find();

  res.status(200).json({ count: rates.length, data: rates });
});

app.listen(process.env.PORT, () => {
  console.log("Server had started on port " + process.env.PORT);
});
