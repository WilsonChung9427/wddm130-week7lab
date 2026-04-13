const express = require('express')
const path = require('path')
const {check, validationResult} = require('express-validator');
const mongoose = require('mongoose');
var session = require('express-session')

const Order = mongoose.model('Order',{
  name:String,
  email:String,
  phone:String,
  postcode:String,
  lunch:String,
  ticket: Number,
  campus:String,
  sub: Number,
  tax:Number,
  total:Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Admin = mongoose.model('Admin',{
  username:String,
  password:String
})

const app = express()

app.use(session({
  secret: 'mysecret',
  resave: false,
  saveUninitialized: true
}))

mongoose.connect("mongodb+srv://college:1234@cluster0.rir3grp.mongodb.net/CollegeOrder");

app.use(express.urlencoded({extended:false}));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));

app.set('view engine', 'ejs');


app.get('/',(req,res)=>{

    res.render('form.ejs');
})

app.get('/login',(req,res)=>{
  res.render('login.ejs');
})

app.post('/login',[
  check("uname","UserName Empty").notEmpty(),
  check("pass","Password Empty").notEmpty(),
],(req,res)=>{

  const errors = validationResult(req);
  console.log(errors);
  if(errors.isEmpty()){

    Admin.findOne({username:req.body.uname}).then((data)=>{
      if(data == null || data.password != req.body.pass){
        res.render('login',{loginError:"UserName or Password Incorrect"})
      }else{
        //Login successful
        req.session.loggedIn = true
        req.session.user = data.username;
        res.redirect('/allOrders');
      }
    }).catch((err)=>{
      console.log("err");
    })
  }else{
    res.render('login',{errors:errors.array()})
  }
})

app.get('/logout',(req,res)=>{
  req.session.destroy();
  res.redirect('/login');

})


app.post('/processForm',[
  check('name', 'Name is Empty').notEmpty(),
  check('email', 'Not a valid Email').isEmail(),
  check('tickets','Ticket Not Selected').notEmpty().custom(value=>{
    
    if (isNaN(value) ){
      throw Error("This is not a Number");
    }else if(value <= 0){
       throw Error("Not a Positive Number");
    }else{
      return true;
    }
  }),
  check('campus','Campus Not Selected').notEmpty(),
  check('lunch','Select Yes/No for Lunch').notEmpty(),
  check('postcode','Invalid Post Code Format').matches(/^[a-zA-Z]\d[a-zA-Z]\s\d[a-zA-Z]\d$/),
  check('phone','Invalid phone Number').matches(/^\d{3}(\s|-)\d{3}(\s|-)\d{4}$/),
  check('lunch').custom((value,{req})=>{
     
     if(typeof(value) != 'undefined' ){
      if (value == 'yes' && req.body.tickets < 3){
        throw Error("When Lunch == Yes Buy 3 or more tickets")
      }
     }else{
        throw Error("Lunch Selection (Yes/No) Not Completed")
     }
     return true;
   
  })
  
],(req,res)=>{

  const errors = validationResult(req);  
    if(errors.isEmpty()){
      //No Errors
      var lunch_index = -1, cost = 0, tax, total; 
      
      var name = req.body.name;
      var email = req.body.email;
      //var post = req.body.postcode;
      //var phone = req.body.phone;
      var campus = req.body.campus;
      var tickets = req.body.tickets;
      var lunch = req.body.lunch;
      for(var i = 0; i< lunch.length; i++){
        if(lunch[i].checked){
            lunch_index = i; // storing the index that the user selected
            break;
        }
      }
      // Checking if any of the radio buttons was selected
      if(lunch_index > -1){
          lunch = lunch[lunch_index].value;
      }

      if(tickets > 0){// if tickets were selected
          cost = 100*tickets;
      }
      if(lunch == 'yes'){//if taking lunch
          cost += 60;//add 60 to the total cost
      }

      tax = cost * 0.13;
      total = cost + tax

      var receipt = {
        "name":name,
        "email":email,
        "lunch":lunch,
        "campus":campus,
        "sub":cost.toFixed(2),
        "tax":tax.toFixed(2),
        "total":total.toFixed(2)
      }

      //Saving Data to the database
      var newOrder = new Order({
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        postcode: req.body.postcode,
        campus: req.body.campus,
        ticket: tickets,
        lunch: lunch,
        sub: cost,       
        tax: tax,
        total: total
      });

      newOrder.save().then((data)=>{  
         res.render('form',{recpt: data});
      }).catch((err)=>{
        console.log("Data Saving Error!!!");
      })

      //console.log(`${name}`);
      //console.log(`${lunch}`)


    }else{
      //errors there
      res.render('form',{errors:errors.array() }) 
   
    }

});

app.get('/allOrders',(req,res)=>{
  if(req.session.loggedIn){
      Order.find({}).then((data)=>{

          res.render('orders',{
              datax: data,
              logged: {
                  name: req.session.user,
                  status: req.session.loggedIn
              }
          });

      }).catch((err)=>{
          console.log("Data Read Error");
      })
  }else{
    res.redirect('/login')
  }
});


app.get('/orders/delete/:id', (req, res) => {
  if(req.session.loggedIn){
    Order.findByIdAndDelete(req.params.id)
      .then(() => {
        res.redirect('/allOrders');
      })
      .catch((err) => {
        console.log("Delete Error");
      });
  } else {
    res.redirect('/login');
  }
});

app.get('/orders/edit/:id', (req, res) => {
  if(req.session.loggedIn){
    Order.findById(req.params.id)
      .then((data) => {
        res.render('edit-order', { order: data });
      })
      .catch(() => {
        console.log("Edit Load Error");
      });
  } else {
    res.redirect('/login');
  }
});

app.post('/orders/edit/:id', [
  check('name', 'Name is Empty').notEmpty(),
  check('email', 'Not a valid Email').isEmail(),
  check('tickets','Invalid Tickets').isNumeric()
], (req, res) => {

  const errors = validationResult(req);

  if(!errors.isEmpty()){
    return res.render('edit-order', {
      order: req.body,
      errors: errors.array()
    });
  }

  let tickets = req.body.tickets;
  let lunch = req.body.lunch;

  let cost = tickets * 100;
  if(lunch === 'yes'){
    cost += 60;
  }

  let tax = cost * 0.13;
  let total = cost + tax;

  Order.findByIdAndUpdate(req.params.id, {
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    postcode: req.body.postcode,
    campus: req.body.campus,
    ticket: tickets,
    lunch: lunch,
    sub: cost,
    tax: tax,
    total: total
  })
  .then(() => {
    res.redirect('/allOrders');
  })
  .catch(() => {
    console.log("Update Error");
  });

});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
